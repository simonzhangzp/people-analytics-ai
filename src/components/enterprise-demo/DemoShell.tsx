"use client";

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { CASES } from "@/lib/people/demo-cases";

export function CaseSelector({ active }: { active?: "trust" | "incident" | "attrition" }) {
  return (
    <nav className="flex flex-col gap-2" aria-label="Case studies">
      {CASES.map((item, index) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`rounded-[6px] border px-3 py-2 text-[12px] font-semibold ${
              isActive
                ? "border-[#9aafe8] bg-[#eef2ff] text-[#23449f]"
                : "border-[#e3e7ed] bg-white text-[#546277] hover:border-[#c5cdd8]"
            }`}
          >
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#738097]">
              Case {index + 1}
            </span>
            {item.question}
          </Link>
        );
      })}
    </nav>
  );
}

export function WhyIBuiltThis() {
  return (
    <section className="mt-16 border-t border-[#e3e7ed] pt-10" data-testid="why-i-built-this">
      <p className="eyebrow">Why this matters</p>
      <h2 className="mt-3 text-[22px] font-bold tracking-[-0.03em] text-[#13203a]">Why I built this</h2>
      <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[#546277]">
        Building enterprise People Analytics taught me that trusted decisions start long
        before the dashboard. Strong models do not fix inconsistent metrics, broken source
        data, unclear ownership or missing lineage. AI makes this foundation more important,
        not less.
      </p>
      <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#546277]">
        PeopleAnalyticsAI explores what an AI-ready People Analytics stack looks like when
        governed data, advanced analytics and AI are designed together.
      </p>
    </section>
  );
}

const STAGE: Record<string, { stage: string; question: string }> = {
  trust: { stage: "Measurement", question: "Can this Headcount number be used in a decision?" },
  incident: { stage: "Data", question: "Is the drop a workforce change or a feed failure?" },
  attrition: { stage: "Analysis", question: "Where is Engineering attrition concentrating?" },
};

export function DemoShell({
  children,
  active,
  railExtra,
  ai,
}: {
  children: React.ReactNode;
  active?: "trust" | "incident" | "attrition";
  railExtra?: React.ReactNode;
  ai?: React.ReactNode;
}) {
  const stage = active ? STAGE[active] : undefined;
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader active="/enterprise-demo" />
      <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
          <aside className="space-y-4">
            <div className="surface p-4">
              <p className="eyebrow">Workflow</p>
              <p className="mt-2 text-[13px] font-semibold text-[#1c2b44]">{stage?.stage ?? "Strategy"}</p>
              <p className="mt-2 text-[12px] leading-5 text-[#546277]">{stage?.question}</p>
            </div>
            <CaseSelector active={active} />
            {railExtra}
          </aside>
          <div>{children}</div>
          <aside className="space-y-4">
            {ai}
            <p className="text-[11px] leading-5 text-[#667085]">
              Case pages read certified aggregates only.
            </p>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

export function ServingUnavailable() {
  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <SiteHeader active="/enterprise-demo" />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="eyebrow">Enterprise demo</p>
        <h1 className="mt-3 text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          People serving is not configured
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-[#536177]">
          Set server-only PEOPLE_DB_URL (transaction pooler 6543, role people_app) and
          PEOPLE_SERVING_REF=zapmigfrtnwnkmezjefx. The v2 path does not use
          NEXT_PUBLIC_SUPABASE_*.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
