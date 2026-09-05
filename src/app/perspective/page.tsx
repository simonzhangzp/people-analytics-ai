import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata = pageMetadata({
  title: "Perspective",
  description: "Why governed People data has to exist before workforce AI can be trusted.",
  path: "/perspective",
});

export default function PerspectivePage() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader active="/perspective" />
      <main className="mx-auto max-w-[800px] px-5 py-12 sm:px-8">
        <p className="eyebrow">Perspective</p>
        <h1 className="mt-4 text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          Why governance is the People AI problem
        </h1>
        <p className="mt-5 text-[16px] leading-7 text-[#546277]">
          Building enterprise People Analytics taught me that trusted decisions start
          long before the dashboard. Strong models do not fix inconsistent metrics,
          broken source data, unclear ownership or missing lineage. AI makes this
          foundation more important, not less.
        </p>
        <p className="mt-4 text-[16px] leading-7 text-[#546277]">
          PeopleAnalyticsAI explores what an AI-ready People Analytics stack looks
          like when governed data, advanced analytics and AI are designed together:
          HR domain knowledge, data science, an enterprise data foundation, workforce
          intelligence, then a bounded AI layer over certified metrics.
        </p>
        <p className="mt-4 text-[16px] leading-7 text-[#546277]">
          The three case studies are the proof: a number you can trust, an incident
          that must not be published as a workforce change, and an attrition story
          that separates evidence from explanation.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
