import Link from "next/link";
import { cookies } from "next/headers";

import { getPrivacyPolicy, privacyContactEmail } from "@/content/privacy-policy";
import { COOKIE_LOCALE } from "@/lib/cookies";

const locales = ["en", "ru", "uk", "bg"] as const;

function parseLocale(raw: string | undefined): string {
  if (raw && (locales as readonly string[]).includes(raw)) return raw;
  return "ru";
}

function resolvePublicHost(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
  if (url) {
    try {
      return new URL(url).hostname;
    } catch {
      /* fall through */
    }
  }
  return "test-adm.tech";
}

type PrivacyPageProps = {
  searchParams: Promise<{ lang?: string }>;
};

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const locale = parseLocale(sp.lang ?? cookieStore.get(COOKIE_LOCALE)?.value);
  const doc = getPrivacyPolicy(locale);
  const host = resolvePublicHost();
  const contactEmail = privacyContactEmail(host);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div>
            <p className="font-serif text-sm tracking-wide text-[hsl(var(--muted-foreground))]">
              Hunger Beauty
            </p>
            <h1 className="font-serif text-2xl font-semibold tracking-tight md:text-3xl">
              {doc.title}
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{doc.subtitle}</p>
          </div>
          <nav className="flex shrink-0 gap-2 text-sm" aria-label="Language">
            {locales.map((loc) => (
              <Link
                key={loc}
                href={`/privacy?lang=${loc}`}
                className={
                  loc === doc.locale
                    ? "rounded-full bg-[hsl(var(--primary))] px-3 py-1 font-medium text-[hsl(var(--primary-foreground))]"
                    : "rounded-full border border-[hsl(var(--border))] px-3 py-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                }
                hrefLang={loc}
              >
                {loc.toUpperCase()}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="mb-8 text-sm text-[hsl(var(--muted-foreground))]">
          {doc.lastUpdated}
        </p>

        <article className="prose-policy space-y-10">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="font-serif text-lg font-semibold tracking-tight">{section.title}</h2>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[hsl(var(--foreground))]/90">
                {section.paragraphs.map((p, i) => (
                  <p key={`${section.id}-p-${i}`}>{p}</p>
                ))}
                {section.bullets?.length ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.bullets.map((item, i) => (
                      <li key={`${section.id}-b-${i}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </article>

        <section
          id="contact"
          className="mt-12 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
        >
          <h2 className="font-serif text-lg font-semibold">{doc.contactHeading}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            {doc.contactHint}
          </p>
          <p className="mt-4">
            <a
              href={`mailto:${contactEmail}`}
              className="text-[15px] font-medium text-[hsl(var(--primary))] underline-offset-2 hover:underline"
            >
              {contactEmail}
            </a>
          </p>
        </section>

        <p className="mt-10">
          <Link
            href="/"
            className="text-sm font-medium text-[hsl(var(--primary))] underline-offset-2 hover:underline"
          >
            ← {doc.backHome}
          </Link>
        </p>
      </main>
    </div>
  );
}
