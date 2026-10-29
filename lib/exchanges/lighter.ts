import { record, records } from "./adapters";
import { D, decimal, multiply, sum } from "./decimal";
import { finishPosition, positive } from "./provider-utils";
import { reserveRequest } from "./rate-budget";
import {
  ExchangeError,
  type AccountBalance,
  type ExchangeAdapter,
  type OpenPosition,
  type SyncResult,
} from "./types";

/**
 * Lighter (zk-rollup perp DEX): accounts are public by the owner's EVM address, like Hyperliquid, so
 * no key is needed. One address can own a main account and sub-accounts; each becomes an account of
 * the connection. Collateral is USDC; other coins (ETH) can serve as margin, and Lighter leaves
 * them out of `total_asset_value`, so the equity adds them at their price. Standard accounts pay no
 * trading fees.
 */
const BASE = "https://mainnet.zklighter.elliot.ai/api/v1";
/** Lighter's answer for an address without an account. */
const NOT_FOUND = 21100;

export async function readLighterAccounts(address: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  await reserveRequest("lighter", 1);
  const res = await fetchImpl(`${BASE}/account?by=l1_address&value=${encodeURIComponent(address)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) throw new ExchangeError("RATE_LIMIT");
  // An unknown address is a 400 with a code in the body; any other failure has no body worth reading.
  if (!res.ok && res.status !== 400) throw new ExchangeError("UNAVAILABLE", `lighter http ${res.status}`);
  return res.json();
}

/** Whether an address has a Lighter account worth linking: funded or with an open position. */
export function lighterAccountState(payload: unknown): "listed" | "absent" {
  const body = record(payload);
  if (Number(body.code) === NOT_FOUND) return "absent";
  if (Number(body.code) !== 200) throw new ExchangeError("UNAVAILABLE", `lighter code ${String(body.code)}`);
  const funded = records(body.accounts).some(
    (a) =>
      Number(a.total_asset_value) > 0 ||
      records(a.positions).some((p) => Number(p.position) !== 0),
  );
  return funded ? "listed" : "absent";
}

function position(account: Row, p: Row, rate: string | null): OpenPosition {
  const size = new D(String(p.position)).abs().toFixed();
  const value = decimal(p.position_value);
  const mark = value !== null && !new D(size).isZero() ? new D(value).abs().div(size).toFixed() : null;
  const pnl = decimal(p.unrealized_pnl);
  const imf = Number(p.initial_margin_fraction);
  const isolated = Number(p.margin_mode) === 1;
  return finishPosition({
    positionKey: `${String(account.index)}:${String(p.market_id)}`,
    symbol: String(p.symbol),
    base: String(p.symbol),
    settle: "USDC",
    side: Number(p.sign) < 0 ? "short" : "long",
    contracts: size,
    contractSize: "1",
    baseSize: size,
    notionalUsd: multiply(value === null ? null : new D(value).abs().toFixed(), rate),
    entryPrice: positive(p.avg_entry_price),
    markPrice: mark,
    liquidationPrice: positive(p.liquidation_price),
    // The initial margin fraction is a percentage: 2.00 means 50x.
    leverage: imf > 0 ? new D(100).div(imf).toFixed() : null,
    marginMode: isolated ? "isolated" : "cross",
    margin: isolated ? decimal(p.allocated_margin) : null,
    unrealizedPnl: pnl,
    unrealizedPnlUsd: multiply(pnl, rate),
    funding: {
      // The sign of total_funding_paid_out is not documented: no funding figure rather than a wrong one.
      amount: null,
      realizedPnl: decimal(p.realized_pnl),
      tradingFees: "0",
      since: null,
      updatedAt: Date.now(),
      status: "unavailable",
    },
  });
}

type Row = Record<string, unknown>;

export class LighterAdapter implements ExchangeAdapter {
  constructor(
    private address: string,
    private prices: () => Promise<Map<string, string>>,
    private read: (address: string) => Promise<unknown> = readLighterAccounts,
  ) {}
  async close() {}
  verify() {
    if (!/^0x[0-9a-f]{40}$/i.test(this.address)) return Promise.reject(new ExchangeError("INVALID_RESPONSE"));
    return Promise.resolve({ externalAccountId: this.address.toLowerCase() });
  }
  async fetch(): Promise<SyncResult> {
    await this.verify();
    const body = record(await this.read(this.address));
    if (Number(body.code) === NOT_FOUND) throw new ExchangeError("UNSUPPORTED_ACCOUNT", "lighter account not found");
    if (Number(body.code) !== 200) throw new ExchangeError("UNAVAILABLE", `lighter code ${String(body.code)}`);
    const rates = await this.prices().catch(() => new Map<string, string>());
    const usdc = rates.get("USDC") ?? "1";
    const accounts: AccountBalance[] = [];
    for (const a of records(body.accounts)) {
      if (String(a.l1_address ?? "").toLowerCase() !== this.address.toLowerCase())
        throw new ExchangeError("INVALID_RESPONSE", "lighter address");
      const positions = records(a.positions)
        .filter((p) => Number(p.position) !== 0)
        .map((p) => position(a, p, usdc));
      const equity = decimal(a.total_asset_value);
      // An empty sub-account is noise; the main account stays even when empty.
      if (Number(a.account_type) !== 0 && !positions.length && (equity === null || Number(equity) === 0)) continue;
      const balances = records(a.assets)
        .filter((asset) => Number(asset.margin_balance) !== 0)
        .map((asset) => {
          const symbol = String(asset.symbol).toUpperCase();
          const total = new D(String(asset.margin_balance)).toFixed();
          const price = symbol === "USDC" ? usdc : (rates.get(symbol) ?? null);
          return {
            assetId: `lighter:${String(a.index)}:${symbol}`,
            symbol,
            total,
            free: null,
            locked: null,
            debt: null,
            priceUsd: price,
            usdValue: multiply(total, price),
          };
        });
      // total_asset_value counts USDC and PnL; margin held in other coins comes on top.
      const coinMargin = balances.filter((b) => b.symbol !== "USDC");
      const equityUsd =
        equity === null || coinMargin.some((b) => b.usdValue === null)
          ? null
          : sum([multiply(equity, usdc), ...coinMargin.map((b) => b.usdValue)]);
      accounts.push({
        accountKey: `lighter:${String(a.index)}`,
        kind: "futures",
        mode: Number(a.account_type) === 0 ? "lighter-main" : "lighter-sub",
        equityUsd,
        availableUsd: multiply(decimal(a.available_balance), usdc),
        unrealizedPnlUsd: positions.length ? sum(positions.map((p) => p.unrealizedPnlUsd)) : "0",
        complete: equityUsd !== null,
        errorCode: equityUsd === null ? "UNPRICED_ASSETS" : null,
        balances,
        positions,
      });
    }
    return { accounts, failedAccounts: [] };
  }
}
