"use client";

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { CASES } from "@/lib/people/demo-cases";

export function CaseSelector({ active }: { active?: "trust" | "incident" | "attrition" }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Case studies">
      {CASES.map((item) => {
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

export function DemoShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "trust" | "incident" | "attrition";
}) {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader active="/enterprise-demo" />
      <div className="mx-auto max-w-[980px] px-5 py-8 sm:px-8">
        <CaseSelector active={active} />
        <div className="mt-8">{children}</div>
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
          Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the People
          staging project to load certified marts.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
