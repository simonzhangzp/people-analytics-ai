import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { BUILDER_EMAIL, BUILDER_HEADLINE, BUILDER_LINKEDIN, BUILDER_NAME } from "@/lib/site-contact";
import { pageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "About Simon Zhang",
  description:
    "Simon Zhang builds People Analytics systems with source-contract-first data, governance as code, certified metrics, and identity-aware serving.",
  path: "/about",
});

export default function AboutPage() {
  const email = BUILDER_EMAIL;
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SiteHeader active="/about" />
      <main className="w-full flex-1 mx-auto max-w-[800px] px-5 py-12 sm:px-8">
        <p className="eyebrow">About</p>
        <h1 className="mt-4 text-[36px] font-bold leading-[1.08] tracking-[-0.035em] text-ink sm:text-[44px]">
          {BUILDER_NAME}
        </h1>
        <p className="mt-5 text-[18px] leading-8 text-body">{BUILDER_HEADLINE}</p>
        <ul className="mt-6 flex flex-col gap-2 text-[15px] leading-7 text-body" data-testid="about-contact">
          <li>
            LinkedIn:{" "}
            <a className="font-semibold text-primary" href={BUILDER_LINKEDIN} rel="noreferrer" target="_blank">
              {BUILDER_LINKEDIN.replace(/^https:\/\/(www\.)?/, "")}
            </a>
          </li>
          {email ? (
            <li>
              Email:{" "}
              <a className="font-semibold text-primary" href={`mailto:${email}`}>
                {email}
              </a>
            </li>
          ) : null}
        </ul>

        <section className="surface mt-10 p-6 sm:p-8" data-testid="what-i-built-here">
          <p className="eyebrow">This site</p>
          <h2 className="mt-3 text-[24px] font-bold tracking-[-0.03em] text-ink">
            What I <span className="hl hl-ai">built</span> here
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-body-2">
            PeopleAnalyticsAI is a working People Data & AI environment, not a slide deck.
            Source contracts come first. Governance is code: roles, RLS, and demo identities.
            The serving layer runs automated data-quality tests and a 21-metric certified
            registry. Public case pages read aggregates only; min-cell suppression and
            identity isolation change which cells — and which conclusion — each role can see.
          </p>
        </section>
        <p className="mt-8 text-[15px] leading-7 text-body-2">
          The public site is a portfolio project over a working synthetic enterprise
          dataset (GlobalTech). Start with the{" "}
          <Link href="/enterprise-demo" className="font-semibold text-primary">
            Enterprise Demo
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
