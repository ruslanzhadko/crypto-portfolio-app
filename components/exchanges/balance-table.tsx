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
    .flatMap((a) => a.balances.map((b) => ({ ...b, account: a })))
    .sort((a, b) => Number(b.usdValue ?? 0) - Number(a.usdValue ?? 0));
  const threshold = ["0", "0.10", "1", "10"].includes(minimum)
    ? Number(minimum)
    : 0.1;
  const balances = allBalances.filter(
    (b) => b.usdValue === null || Math.abs(Number(b.usdValue)) >= threshold,
  );
  return (
    <section className="min-w-0 space-y-3">
      <h3 className="font-semibold">{t("exchangeAssets")}</h3>
      <p className="text-xs text-text-muted">{t("assetEquityNote")}</p>
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
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs text-text-muted">
              <tr>
                <th className="p-3">{t("coin")}</th>
                <th className="p-3">{t("location")}</th>
                <th className="p-3 text-right">{t("quantity")}</th>
                <th className="p-3 text-right">{t("value")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {balances.map((b) => (
                <tr key={b.id}>
                  <td className="p-3 font-medium">
                    <span className="flex items-center gap-2">
                      <ExchangeTokenLogo symbol={b.symbol} />
                      <span>{b.symbol}</span>
                    </span>
                  </td>
                  <td className="p-3">
                    <p>{b.account.label}</p>
                    <span className="text-xs text-text-muted">
                      {b.account.exchange} · {t(`kinds.${b.account.kind}`)}
                    </span>
                    {b.account.stale && (
                      <p className="text-xs text-warning">{t("stale")}</p>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Quantity value={b.total} />
                    <details className="mt-1 text-xs text-text-muted">
                      <summary className="cursor-pointer">
                        {t("details")}
                      </summary>
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
                  <td className="p-3 text-right">
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
