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
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader active="/about" />
      <main className="mx-auto max-w-[800px] px-5 py-12 sm:px-8">
        <p className="eyebrow">About</p>
        <h1 className="mt-4 text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          {BUILDER_NAME}
        </h1>
        <p className="mt-5 text-[16px] leading-7 text-[#546277]">{BUILDER_HEADLINE}</p>
        <ul className="mt-6 flex flex-col gap-2 text-[15px] leading-7 text-[#3e4c61]" data-testid="about-contact">
          <li>
            LinkedIn:{" "}
            <a className="font-semibold text-[#3157c9]" href={BUILDER_LINKEDIN} rel="noreferrer" target="_blank">
              {BUILDER_LINKEDIN.replace(/^https:\/\/(www\.)?/, "")}
            </a>
          </li>
          {email ? (
            <li>
              Email:{" "}
              <a className="font-semibold text-[#3157c9]" href={`mailto:${email}`}>
                {email}
              </a>
            </li>
          ) : null}
        </ul>

        <section className="mt-10" data-testid="what-i-built-here">
          <p className="eyebrow">This site</p>
          <h2 className="mt-3 text-[22px] font-bold tracking-[-0.03em] text-[#13203a]">
            What I built here
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-[#546277]">
            PeopleAnalyticsAI is a working People Data & AI environment, not a slide deck.
            Source contracts come first. Governance is code: roles, RLS, and demo identities.
            The serving layer runs automated data-quality tests and a 21-metric certified
            registry. Public case pages read aggregates only; min-cell suppression and
            identity isolation change which cells — and which conclusion — each role can see.
          </p>
        </section>
        <p className="mt-8 text-[15px] leading-7 text-[#546277]">
          The public site is a recruiter portfolio over a working synthetic enterprise
          dataset (GlobalTech). Start with the{" "}
          <Link href="/enterprise-demo" className="font-semibold text-[#3157c9]">
            Enterprise Demo
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
