import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { WhyIBuiltThis } from "@/components/enterprise-demo/DemoShell";
import { CASES } from "@/lib/people/demo-cases";

export const dynamic = "force-dynamic";

const CASE_CTAS = {
  trust: "Explore trusted Headcount",
  incident: "Replay the incident",
  attrition: "Explore the analysis",
} as const;

export default function EnterpriseDemoLandingPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader active="/enterprise-demo" />
      <main className="mx-auto max-w-[980px] px-5 py-10 sm:px-8">
        <p className="eyebrow">Enterprise Demo</p>
        <h1 className="mt-3 max-w-3xl text-[36px] font-bold leading-[1.12] tracking-[-0.04em] text-[#13203a]">
          Trusted workforce numbers, then intelligence, then AI.
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-7 text-[#546277]">
          Three case studies. One click each. The same governed People platform underneath.
        </p>
        <p className="mt-3 text-[13px] font-medium text-[#3657af]" data-testid="synthetic-label">
          GlobalTech · Synthetic Enterprise People Dataset · not a real company
        </p>

        <div className="mt-8 grid gap-4" data-testid="demo-cases">
          {CASES.map((item, index) => (
            <Link
              key={item.id}
              href={item.href}
              data-testid={`case-card-${item.id}`}
              className="surface block p-5 transition-colors hover:border-[#c5cdd8]"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#738097]">
                Case {index + 1} · {item.subtitle}
              </p>
              <h2 className="mt-2 text-[22px] font-bold tracking-[-0.03em] text-[#13203a]">
                {item.question}
              </h2>
              <p className="mt-2 text-[14px] leading-6 text-[#546277]">{item.description}</p>
              <span className="mt-3 inline-block text-[13px] font-semibold text-[#3157c9]">
                {CASE_CTAS[item.id]}
              </span>
            </Link>
          ))}
        </div>
        <WhyIBuiltThis />
      </main>
      <SiteFooter />
    </div>
  );
}
