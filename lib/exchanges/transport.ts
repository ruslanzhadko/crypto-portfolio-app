import { binance, bybit, gate, okx, bingx, bitget, type Exchange } from "ccxt";
import { reserveRequest } from "./rate-budget";
export { reserveRequest, sleep } from "./rate-budget";
import type { Credentials } from "./types";

export type Request = (
  path: string,
  api: string,
  params?: Record<string, unknown>,
  weight?: number,
) => Promise<unknown>;
export function createTransport(
  id: "binance" | "bybit" | "gate" | "okx" | "bingx" | "bitget",
  credentials: Credentials,
) {
  const Client = { binance, bybit, gate, okx, bingx, bitget }[id];
  const client: Exchange = new Client({
    apiKey: credentials.apiKey,
    secret: credentials.secret,
    password: credentials.passphrase,
    enableRateLimit: true,
    timeout: 15_000,
  });
  client.verbose = false;
  // Preserve Bitget business codes for strict mode detection (25245 only).
  // The adapter validates every envelope; transport/HTTP failures still throw.
  if (id === "bitget") client.handleErrors = () => undefined;
  // Only internally selected paths and GET methods reach this transport.
  const request: Request = async (path, api, params = {}, weight = 1) => {
    await reserveRequest(id, weight);
    return client.request(
      path,
      ["gate", "bingx", "bitget"].includes(id) ? api.split(":") : api,
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
