import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentShell } from "@/components/layout/content-shell";
import { ChangelogSeenMarker } from "@/components/changelog/seen-marker";
import { CHANGELOG, type ChangelogLocale } from "@/lib/changelog/entries";

export const dynamic = "force-dynamic";

function changelogLocale(locale: string): ChangelogLocale {
  return locale === "ru" || locale === "uk" ? locale : "en";
}

export default async function ChangelogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = changelogLocale(locale);
  const t = await getTranslations("Changelog");
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <ContentShell>
      <div className="mx-auto max-w-3xl">
        <ChangelogSeenMarker />
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {t("pageTitle")}
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-text-muted md:text-sm">
            {t("pageDescription")}
          </p>
        </div>
        <ol className="mt-6 space-y-8">
          {CHANGELOG.map((entry, index) => (
            <li
              key={`${entry.date}-${index}`}
              className="grid gap-2 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-6"
            >
              <time
                dateTime={entry.date}
                className="text-sm font-medium text-text-muted md:pt-0.5"
              >
                {dateFormat.format(new Date(`${entry.date}T12:00:00Z`))}
              </time>
              <div>
                <h2 className="text-base font-semibold md:text-lg">
                  {entry.title[lang]}
                </h2>
                <ul className="mt-2 space-y-1.5 text-sm leading-6 text-text-muted">
                  {entry.items[lang].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-primary"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </ContentShell>
  );
}
