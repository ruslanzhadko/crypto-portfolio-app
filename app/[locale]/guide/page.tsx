import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentShell } from "@/components/layout/content-shell";
import { ExchangeLogo } from "@/components/exchanges/exchange-logo";
import { EXCHANGE_GUIDES } from "@/lib/exchanges/guide";
import type { ChangelogLocale } from "@/lib/changelog/entries";

function guideLocale(locale: string): ChangelogLocale {
  return locale === "ru" || locale === "uk" ? locale : "en";
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = guideLocale(locale);
  const t = await getTranslations("Guide");

  return (
    <ContentShell>
      <div className="mx-auto max-w-3xl">
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {t("pageTitle")}
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-text-muted md:text-sm">
            {t("pageDescription")}
          </p>
        </div>

        <section className="mt-6 rounded-xl border border-border bg-surface p-4 text-sm leading-6 text-text-muted">
          <h2 className="text-base font-semibold text-text">{t("rulesTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t("ruleReadOnly")}</li>
            <li>{t("ruleIp")}</li>
            <li>{t("ruleSecret")}</li>
          </ul>
        </section>

        <nav aria-label={t("jump")} className="mt-6 flex flex-wrap gap-2">
          {EXCHANGE_GUIDES.map((guide) => (
            <a
              key={guide.id}
              href={`#${guide.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <ExchangeLogo exchange={guide.id} size={16} />
              {guide.name}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-10">
          {EXCHANGE_GUIDES.map((guide) => (
            <section key={guide.id} id={guide.id} className="scroll-mt-24">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ExchangeLogo exchange={guide.id} size={22} />
                {guide.name}
              </h2>
              <h3 className="mt-3 text-sm font-medium">{t("stepsTitle")}</h3>
              <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-text-muted">
                {guide.steps[lang].map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <h3 className="mt-3 text-sm font-medium">
                {t("permissionsTitle")}
              </h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">
                {guide.permissions[lang].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {guide.note && (
                <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-5 text-text-muted">
                  {guide.note[lang]}
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </ContentShell>
  );
}
