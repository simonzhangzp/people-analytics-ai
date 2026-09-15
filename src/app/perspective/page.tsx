import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata = pageMetadata({
  title: "Perspective",
  description: "Why governed People data has to exist before workforce AI can be trusted.",
  path: "/perspective",
});

export default function PerspectivePage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SiteHeader active="/perspective" />
      <main className="w-full flex-1 mx-auto max-w-[800px] px-5 py-12 sm:px-8">
        <p className="eyebrow">Perspective</p>
        <h1 className="mt-4 text-[36px] font-bold leading-[1.08] tracking-[-0.035em] text-ink sm:text-[44px]">
          Why <span className="hl hl-certified">governance</span> is the People{" "}
          <span className="hl hl-ai">AI</span> problem
        </h1>
        <p className="mt-6 text-[19px] leading-8 text-body">
          Building enterprise People Analytics taught me that trusted decisions start
          long before the dashboard. Strong models do not fix inconsistent metrics,
          broken source data, unclear ownership or missing lineage.{" "}
          <strong className="font-semibold text-ink">AI makes this foundation more important, not less.</strong>
        </p>
        <p className="mt-4 text-[16px] leading-7 text-body-2">
          PeopleAnalyticsAI explores what an AI-ready People Analytics stack looks
          like when governed data, advanced analytics and AI are designed together:
          HR domain knowledge, data science, an enterprise data foundation, workforce
          intelligence, then a bounded AI layer over certified metrics.
        </p>
        <blockquote className="mt-8 border-l-4 border-certified pl-5 text-[17px] leading-8 text-ink">
          The three case studies are the proof: a number you can trust, an incident
          that must not be published as a workforce change, and an attrition story
          that separates evidence from explanation.
        </blockquote>
      </main>
      <SiteFooter />
    </div>
  );
}
