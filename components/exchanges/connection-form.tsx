"use client";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExchangeErrorNotice } from "./shared";
import { exchangeAction } from "./use-exchange-data";
import { useExchangeData } from "./use-exchange-data";

export function ConnectionForm({
  workerIp,
  connectionId,
  exchange: initialExchange = "bybit",
  onSaved,
  onCancel,
}: {
  workerIp: string | null;
  connectionId?: string;
  exchange?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Exchanges"),
    locale = useLocale();
  const [exchange, setExchange] = useState(initialExchange);
  const wallets = useExchangeData<{
    wallets: {
      id: string;
      label: string | null;
      address: string;
      network: string;
      isActive: boolean;
    }[];
  }>("/api/wallets", 60_000);
  const walletBased = exchange === "aster";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = event.currentTarget,
      values = new FormData(form);
    const body = walletBased
      ? {
          exchange: "aster",
          label: values.get("label"),
          walletId: values.get("walletId"),
        }
      : {
          apiKey: values.get("apiKey"),
          secret: values.get("secret"),
          ...(exchange === "okx"
            ? { passphrase: values.get("passphrase") }
            : {}),
          ...(connectionId
            ? { password: values.get("password") || undefined }
            : { exchange: values.get("exchange"), label: values.get("label") }),
        };
    try {
      await exchangeAction(
        connectionId
          ? `/api/exchanges/${connectionId}/credentials`
          : "/api/exchanges",
        "POST",
        body,
      );
      form.reset();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "UNAVAILABLE");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
      autoComplete="off"
      data-private
    >
      <h2 className="text-lg font-semibold">
        {t(connectionId ? "replaceKey" : "connectExchange")}
      </h2>
      <p className="text-sm leading-relaxed text-text-muted">
        {t(walletBased ? "asterWalletInstructions" : "keyInstructions")}
      </p>
      {!walletBased && (
        <p className="text-sm">
          {t("workerIp")}:{" "}
          <code className="select-all rounded bg-surface-2 px-2 py-1">
            {workerIp ?? t("ipNotConfigured")}
          </code>
        </p>
      )}
      <p className="text-xs text-text-muted">{t("supported")}</p>
      {!connectionId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="exchange">{t("exchange")}</Label>
            <div className="relative">
              <select
                id="exchange"
                name="exchange"
                className="h-10 w-full appearance-none rounded-lg border border-border bg-surface-2 pl-3 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                value={exchange}
                onChange={(event) => setExchange(event.target.value)}
              >
                <option value="bybit">Bybit</option>
                <option value="binance">Binance</option>
                <option value="gate">Gate</option>
                <option value="okx">OKX</option>
                <option value="aster">Aster</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-text-muted"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exchange-label">{t("accountLabel")}</Label>
            <Input
              id="exchange-label"
              name="label"
              required
              maxLength={80}
              placeholder={t("labelPlaceholder")}
            />
          </div>
        </div>
      )}
      {walletBased ? (
        <div className="space-y-2">
          <Label htmlFor="aster-wallet">{t("wallet")}</Label>
          <select
            id="aster-wallet"
            name="walletId"
            required
            defaultValue=""
            className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm"
          >
            <option value="" disabled>
              {t("selectWallet")}
            </option>
            {wallets.data?.wallets
              .filter((w) => w.isActive && w.network === "EVM")
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label ?? w.address} · {w.address.slice(0, 6)}…
                  {w.address.slice(-4)}
                </option>
              ))}
          </select>
          <ExchangeErrorNotice code={wallets.error} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="exchange-key">API key</Label>
            <Input
              id="exchange-key"
              name="apiKey"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={256}
              spellCheck={false}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exchange-secret">API secret</Label>
            <Input
              id="exchange-secret"
              name="secret"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={512}
              spellCheck={false}
            />
          </div>
        </div>
      )}
      {exchange === "okx" && (
        <div className="max-w-sm space-y-2">
          <Label htmlFor="exchange-passphrase">API Passphrase</Label>
          <Input
            id="exchange-passphrase"
            name="passphrase"
            type="password"
            autoComplete="new-password"
            required
            maxLength={256}
            spellCheck={false}
          />
          <p className="text-xs text-text-muted">{t("passphraseHint")}</p>
        </div>
      )}
      {exchange === "gate" && (
        <p className="text-xs text-text-muted">{t("gatePermissionsHint")}</p>
      )}
      {connectionId && (
        <div className="max-w-sm space-y-2">
          <Label htmlFor="exchange-password">{t("password")}</Label>
          <Input
            id="exchange-password"
            name="password"
            type="password"
            autoComplete="current-password"
          />
          <p className="text-xs text-text-muted">{t("reauthHint")}</p>
        </div>
      )}
      <ExchangeErrorNotice code={error} />
      {error === "REAUTH_REQUIRED" && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void signOut({
              callbackUrl: `/${locale}/auth/login?callbackUrl=/${locale}/exchanges/${connectionId}`,
            })
          }
        >
          {t("signInAgain")}
        </Button>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || (!walletBased && !workerIp)}>
          {t(busy ? "saving" : "saveAndCheck")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
