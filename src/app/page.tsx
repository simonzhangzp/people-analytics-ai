import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { CASES } from "@/lib/people/demo-cases";
import { formatCount } from "@/lib/people/format";
import { peopleServing, peopleServingConfigured } from "@/lib/people/serving";

export const dynamic = "force-dynamic";

const STACK = [
  ["HR Domain", "Understand the workforce decision and operating context."],
  ["Data Science / ML", "Model workforce patterns, risk and planning scenarios."],
  ["Data Foundation & Governance", "Create trusted data, definitions, metadata, quality and lineage."],
  ["Workforce Intelligence", "Turn governed data into reusable evidence and decisions."],
  ["AI", "Use agents as a reasoning layer over trusted enterprise context."],
];

const CASE_CTAS = {
  trust: "Explore trusted Headcount",
  incident: "Replay the incident",
  attrition: "Explore the analysis",
} as const;

export default async function HomePage() {
  let facts: Record<string, unknown> = {};
  if (peopleServingConfigured()) {
    try {
      facts = (await peopleServing.getPlatformFacts()) as Record<string, unknown>;
    } catch {
      facts = {};
    }
  }
  const factRow = [
    [formatCount(facts.active_employees ?? 50010), "Synthetic Employees"],
    [String(facts.historical_years ?? 5), "Years of Workforce History"],
    [String(facts.certified_metrics ?? 20), "Certified Metrics"],
    [String(facts.data_quality_tests ?? 30), "Automated Quality Tests"],
    [`${facts.hr_data_domains ?? 6}+`, "People Data Domains"],
    ["Daily", "Pipeline Refresh"],
    [formatCount(facts.learning_resources ?? 4587), "Public Learning Resources"],
  ];

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader active="/" />
      <main className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8">
        <p className="eyebrow">People Data & AI Lab</p>
        <h1 className="mt-4 max-w-4xl text-[36px] font-bold leading-[1.1] tracking-[-0.04em] text-[#13203a] sm:text-[44px]">
          Trusted People data. Governed metrics. AI-ready workforce intelligence.
        </h1>
        <p className="mt-5 max-w-3xl text-[17px] leading-7 text-[#536177]">
          A working enterprise People Data & AI environment showing how data
          foundations, governance, workforce analytics, and AI come together to
          support trusted workforce decisions.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/enterprise-demo"
            data-testid="cta-enterprise-demo"
            className="inline-flex min-h-11 items-center rounded-[6px] bg-[#3157c9] px-5 text-[14px] font-semibold text-white"
          >
            Explore the Enterprise Demo
          </Link>
          <Link
            href="/architecture"
            className="inline-flex min-h-11 items-center rounded-[6px] border border-[#d6dce5] bg-white px-5 text-[14px] font-semibold text-[#314361]"
          >
            View Architecture
          </Link>
          <Link href="/about" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[#3157c9]">
            About the builder
          </Link>
        </div>
        <p className="mt-4 text-[12px] text-[#667085]" data-testid="synthetic-label">
          Synthetic Enterprise Dataset · GlobalTech is not a real company
        </p>

        <section className="mt-12" data-testid="home-cases">
          <p className="eyebrow">Flagship stories</p>
          <div className="mt-4 grid gap-4">
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
        </section>

        <section className="mt-14">
          <h2 className="text-[22px] font-bold tracking-[-0.03em] text-[#13203a]">
            People Analytics requires more than a model.
          </h2>
          <ol className="mt-6 space-y-3">
            {STACK.map(([title, copy], index) => (
              <li key={title} className="flex gap-3">
                <span className="mt-1 text-[11px] font-bold text-[#9aa7b8]">{index + 1}</span>
                <div>
                  <p className="text-[14px] font-semibold text-[#1c2b44]">{title}</p>
                  <p className="mt-1 text-[13px] leading-6 text-[#546277]">{copy}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[13px] font-semibold text-[#546277]">
            HR Domain → Data Science / ML → Data Foundation & Governance → Workforce Intelligence → AI
          </p>
        </section>

        <section className="mt-14" data-testid="platform-facts">
          <p className="eyebrow">Platform facts</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {factRow.map(([value, label]) => (
              <div key={label} className="surface p-3">
                <div className="text-[18px] font-bold text-[#13203a]">{value}</div>
                <div className="mt-1 text-[11px] leading-4 text-[#667085]">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14" data-testid="why-i-built-this">
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
      </main>
      <SiteFooter />
    </div>
  );
}
