interface BalanceLike {
  symbol: string;
  total: string;
  priceUsd: string | null;
  usdValue: string | null;
}

interface AccountLike {
  exchange: string;
  kind: string;
  equityUsd: string | null;
  balances: BalanceLike[];
}

/** Exchange coin rows; a single-collateral Aster futures account shows its equity. */
export function exchangeBalanceRows<A extends AccountLike>(accounts: A[]) {
  return accounts
    .flatMap((a) =>
      (a.balances as A["balances"][number][]).map((b) => {
        // Account equity can be assigned to a token only for single-collateral accounts.
        const showsEquity =
          a.exchange === "aster" &&
          a.kind === "futures" &&
          a.balances.length === 1 &&
          b.symbol === "USDT" &&
          a.equityUsd !== null &&
          b.priceUsd !== null &&
          Number(b.priceUsd) > 0;
        return {
          ...b,
          account: a,
          cashTotal: b.total,
          showsEquity,
          total: showsEquity
            ? String(Number(a.equityUsd) / Number(b.priceUsd))
            : b.total,
          usdValue: showsEquity ? a.equityUsd : b.usdValue,
        };
      }),
    )
    .sort((a, b) => Number(b.usdValue ?? 0) - Number(a.usdValue ?? 0));
}
