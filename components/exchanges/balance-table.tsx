"use client";
import { useTranslations } from "next-intl";
import type { CapitalOverview } from "@/lib/exchanges/portfolio";
import { Money, Quantity } from "./shared";
import { useDisplayPreference, warningPreference } from "./display-preferences";
import { ExchangeTokenLogo } from "./token-logo";

export function BalanceTable({
  accounts,
}: {
  accounts: CapitalOverview["accounts"];
}) {
  const t = useTranslations("Exchanges");
  const [minimum, setMinimum] = useDisplayPreference(
    "exchange-dust-minimum",
    "0.10",
  );
  const [hideWarnings, setHideWarnings] = useDisplayPreference(
    warningPreference,
    "false",
  );
  const allBalances = accounts
    .flatMap((a) =>
      a.balances.map((b) => {
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
  const threshold = ["0", "0.10", "1", "10"].includes(minimum)
    ? Number(minimum)
    : 0.1;
  const balances = allBalances.filter((b) =>
    b.usdValue === null
      ? threshold === 0 && hideWarnings !== "true"
      : Math.abs(Number(b.usdValue)) >= threshold,
  );
  return (
    <section className="min-w-0 space-y-3">
      <h3 className="font-semibold">{t("exchangeAssets")}</h3>
      <p className="text-xs text-text-muted">{t("assetEquityNote")}</p>
      {allBalances.some((b) => b.showsEquity) && (
        <p className="text-xs text-text-muted">{t("asterWalletBalanceNote")}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <label className="flex items-center gap-2">
          {t("minimumBalance")}
          <select
            className="rounded-md border border-border bg-surface px-2 py-1.5"
            value={minimum}
            onChange={(e) => setMinimum(e.target.value)}
          >
            {["0", "0.10", "1", "10"].map((value) => (
              <option key={value} value={value}>
                {value === "0" ? t("showAllBalances") : `$${value}`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hideWarnings === "true"}
            onChange={(e) => setHideWarnings(String(e.target.checked))}
          />
          {t("hideValuationWarnings")}
        </label>
      </div>
      {allBalances.length > balances.length && (
        <p className="text-xs text-text-muted">
          {t("hiddenDust", { count: allBalances.length - balances.length })}
        </p>
      )}
      {!balances.length ? (
        <p className="rounded-lg border border-border p-5 text-sm text-text-muted">
          {t("noAssets")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[34%] sm:w-[22%]" />
              <col className="hidden w-[28%] sm:table-column" />
              <col className="w-[36%] sm:w-[30%]" />
              <col className="w-[30%] sm:w-[20%]" />
            </colgroup>
            <thead className="bg-surface-2 text-xs text-text-muted">
              <tr>
                <th className="px-3 py-2">{t("coin")}</th>
                <th className="hidden px-3 py-2 sm:table-cell">
                  {t("location")}
                </th>
                <th className="px-2 py-2 text-right sm:px-3">
                  {t("quantity")}
                </th>
                <th className="px-2 py-2 text-right sm:px-3">{t("value")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {balances.map((b) => (
                <tr key={b.id}>
                  <td className="px-2 py-2 font-medium sm:px-3">
                    <span className="flex items-center gap-2">
                      <ExchangeTokenLogo symbol={b.symbol} />
                      <span className="min-w-0">
                        <span className="block truncate" title={b.symbol}>
                          {b.symbol}
                        </span>
                        <span
                          className="mt-1 block truncate text-xs font-normal text-text-muted sm:hidden"
                          title={`${b.account.label} · ${t(`kinds.${b.account.kind}`)}`}
                        >
                          {b.account.label} · {t(`kinds.${b.account.kind}`)}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="hidden px-3 py-2 sm:table-cell">
                    <p className="truncate" title={b.account.label}>
                      {b.account.label}
                    </p>
                    <span className="text-xs text-text-muted">
                      {t(`kinds.${b.account.kind}`)}
                    </span>
                    {b.showsEquity && (
                      <p className="text-xs text-text-muted">
                        {t("asterEquityBalance")}
                      </p>
                    )}
                    {b.account.stale && (
                      <p className="text-xs text-warning">{t("stale")}</p>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right sm:px-3">
                    <Quantity value={b.total} />
                    <details className="mt-1 text-xs text-text-muted break-words">
                      <summary className="inline-block cursor-pointer">
                        {t("details")}
                      </summary>
                      {b.showsEquity && (
                        <p>
                          {t("asterCashBalance")}:{" "}
                          <Quantity value={b.cashTotal} />
                        </p>
                      )}
                      <p>
                        {t("available")}: <Quantity value={b.free} />
                      </p>
                      <p>
                        {t("locked")}: <Quantity value={b.locked} />
                      </p>
                      <p>
                        {t("debt")}: <Quantity value={b.debt} />
                      </p>
                    </details>
                  </td>
                  <td className="px-2 py-2 text-right sm:px-3">
                    {b.usdValue === null ? (
                      <span className="text-xs text-warning">
                        {t("unpriced")}
                      </span>
                    ) : (
                      <Money value={b.usdValue} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
