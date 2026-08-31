import Link from "next/link";
import { CASES } from "@/lib/people/demo-cases";
import { DemoFooter, DemoHeader, WhyIBuiltThis } from "@/components/enterprise-demo/DemoShell";

export const dynamic = "force-dynamic";

export default function EnterpriseDemoLandingPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <DemoHeader />
      <main className="mx-auto max-w-[980px] px-5 py-12 sm:px-8">
        <p className="eyebrow">People Data & AI · recruiter portfolio</p>
        <h1 className="mt-3 max-w-3xl text-[36px] font-bold leading-[1.12] tracking-[-0.04em] text-[#13203a]">
          Trusted workforce numbers, then intelligence, then AI.
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-7 text-[#546277]">
          Three case studies show how Simon builds People Analytics: HR domain
          knowledge, data science, a governed enterprise data foundation, and AI
          that reasons over certified metrics — not raw extracts.
        </p>
        <p className="mt-3 text-[13px] font-medium text-[#3657af]" data-testid="synthetic-label">
          GlobalTech · Synthetic Enterprise People Dataset · not a real company
        </p>

        <div className="mt-10 grid gap-4">
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
            </Link>
          ))}
        </div>
        <WhyIBuiltThis />
        <DemoFooter />
      </main>
    </div>
  );
}
