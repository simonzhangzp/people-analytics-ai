"use client";

import Link from "next/link";
import { BrandMark, SecondaryLink } from "@/components/ui";
import { CASES } from "@/lib/people/demo-cases";

export function DemoHeader() {
  return (
    <header className="border-b border-[#e3e7ed] bg-white">
      <div className="mx-auto flex h-16 max-w-[980px] items-center gap-3 px-5 sm:px-8">
        <Link href="/" aria-label="People Analytics home">
          <BrandMark />
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <SecondaryLink href="/architecture">Architecture</SecondaryLink>
          <SecondaryLink href="/">Home</SecondaryLink>
        </div>
      </div>
    </header>
  );
}

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
      <p className="eyebrow">Portfolio</p>
      <h2 className="mt-3 text-[22px] font-bold tracking-[-0.03em] text-[#13203a]">Why I Built This</h2>
      <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[#546277]">
        Building enterprise People Analytics taught me that trusted decisions start long
        before the dashboard. Metrics need consistent definitions, data needs clear
        ownership and quality controls, and complex workforce data needs a reliable
        foundation before AI can reason over it.
      </p>
      <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#546277]">
        This demo brings those layers together: governed People data, advanced workforce
        analytics, and AI-assisted decision support.
      </p>
      <ol className="mt-6 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[#1c2b44]">
        {["HR Domain", "Data Science / ML", "Data Foundation & Governance", "People AI"].map(
          (step, index) => (
            <li key={step} className="flex items-center gap-2">
              {index > 0 ? <span className="text-[#9aa7b8]">→</span> : null}
              <span className="rounded-[6px] border border-[#e3e7ed] bg-white px-3 py-2">{step}</span>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

export function DemoFooter() {
  return (
    <footer className="mt-12 border-t border-[#e3e7ed] py-6 text-[12px] text-[#667085]">
      <div className="flex flex-wrap gap-4">
        <Link href="/enterprise-demo" className="hover:text-[#2f4fa9]">
          Case studies
        </Link>
        <Link href="/architecture" className="hover:text-[#2f4fa9]">
          Architecture
        </Link>
        <span>GlobalTech is a synthetic enterprise dataset, not a real company.</span>
      </div>
    </footer>
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
      <DemoHeader />
      <div className="mx-auto max-w-[980px] px-5 py-8 sm:px-8">
        <CaseSelector active={active} />
        <div className="mt-8">{children}</div>
        <WhyIBuiltThis />
        <DemoFooter />
      </div>
    </div>
  );
}

export function ServingUnavailable() {
  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <DemoHeader />
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
    </div>
  );
}
