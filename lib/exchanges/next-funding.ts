import { decimal } from "./decimal";
import type { OpenPosition } from "./types";
import type { Request } from "./transport";
type Row = Record<string, unknown>;
/** One public market request per venue/account every five minutes; history remains hourly. */
export class NextFundingReader {
  private at = 0;
  private data = new Map<
    string,
    { rate: string | null; time: number | null }
  >();
  constructor(
    private venue: "binance" | "bybit" | "hyperliquid",
    private request?: Request,
    private info?: (body: Row) => Promise<unknown>,
  ) {}
  async enrich(positions: OpenPosition[]) {
    if (!positions.length) return;
    const now = Date.now();
    if (
      now - this.at >= 300_000 ||
      [...this.data.values()].some((v) => v.time != null && v.time <= now)
    ) {
      // Set attempt time even on failure, avoiding repeated requests every live sync.
      this.at = now;
      this.data.clear();
      try {
        let entries: Row[];
        if (this.venue === "binance")
          entries = (await this.request!(
            "premiumIndex",
            "fapiPublic",
            {},
            10,
          )) as Row[];
        else if (this.venue === "bybit") {
          const raw = (await this.request!("v5/market/tickers", "public", {
            category: "linear",
          })) as { retCode: number; result: { list: Row[] } };
          if (raw.retCode !== 0) throw Error();
          entries = raw.result.list;
        } else {
          const raw = (await this.info!({ type: "metaAndAssetCtxs" })) as [
            { universe: Row[] },
            Row[],
          ];
          if (
            !Array.isArray(raw) ||
            raw.length !== 2 ||
            !Array.isArray(raw[0]?.universe) ||
            !Array.isArray(raw[1])
          )
            throw Error();
          entries = raw[0].universe.map((v, i) => ({
            symbol: v.name,
            fundingRate: raw[1][i]?.funding,
            nextFundingTime: (Math.floor(now / 3600_000) + 1) * 3600_000,
          }));
        }
        if (!Array.isArray(entries)) throw Error();
        for (const v of entries) {
          try {
            if (typeof v.symbol !== "string") continue;
            const rate = decimal(
              this.venue === "binance" ? v.lastFundingRate : v.fundingRate,
            );
            const time = Number(v.nextFundingTime);
            this.data.set(v.symbol, {
              rate,
              time: Number.isSafeInteger(time) && time > now ? time : null,
            });
          } catch {
            /* optional malformed market row */
          }
        }
      } catch {
        /* market metadata must not fail balance sync */
      }
    }
    for (const p of positions) {
      if (!p.funding) continue;
      const v = this.data.get(this.venue === "hyperliquid" ? p.base : p.symbol);
      p.funding = {
        ...p.funding,
        nextRate: v?.rate ?? null,
        nextTime: v?.time ?? null,
        nextRateUpdatedAt: this.at,
      };
    }
  }
}
