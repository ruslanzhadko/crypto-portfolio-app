import { binance, bybit, gate, okx, type Exchange } from "ccxt";
import { prisma } from "@/lib/db/prisma";
import type { Credentials } from "./types";

export type Request = (
  path: string,
  api: string,
  params?: Record<string, unknown>,
  weight?: number,
) => Promise<unknown>;
export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Conservative shared IP budget: 20 weight units/s Binance; 5 requests/s Bybit. */
export async function reserveRequest(exchange: string, weight = 1) {
  const ms = Math.ceil(weight * (exchange === "binance" ? 50 : 200));
  const rows = await prisma.$queryRaw<{ start: Date }[]>`
    INSERT INTO "ExchangeWorkerLease" ("name", "owner", "expiresAt", "heartbeatAt")
    VALUES (${`rate:${exchange}`}, 'rate', clock_timestamp() + ${ms} * interval '1 millisecond', clock_timestamp())
    ON CONFLICT ("name") DO UPDATE SET "expiresAt" = GREATEST("ExchangeWorkerLease"."expiresAt", clock_timestamp()) + ${ms} * interval '1 millisecond'
    RETURNING "expiresAt" - ${ms} * interval '1 millisecond' AS start`;
  await sleep(Math.max(0, rows[0]!.start.getTime() - Date.now()));
}
export function createTransport(
  id: "binance" | "bybit" | "gate" | "okx",
  credentials: Credentials,
) {
  const Client = { binance, bybit, gate, okx }[id];
  const client: Exchange = new Client({
    apiKey: credentials.apiKey,
    secret: credentials.secret,
    password: credentials.passphrase,
    enableRateLimit: true,
    timeout: 15_000,
  });
  client.verbose = false;
  // Only internally selected paths and GET methods reach this transport.
  const request: Request = async (path, api, params = {}, weight = 1) => {
    await reserveRequest(id, weight);
    return client.request(
      path,
      id === "gate" ? api.split(":") : api,
      "GET",
      params,
    );
  };
  return {
    request,
    close: async () => {
      await client.close();
    },
  };
}
