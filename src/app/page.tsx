import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronRight,
  Database,
  FileCheck2,
  Gauge,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";
import { BrandMark, PrimaryLink, SecondaryLink } from "@/components/ui";

const workflow = [
  {
    icon: Target,
    label: "Strategy",
    description: "Clarify the outcome and decisions that matter.",
  },
  {
    icon: Gauge,
    label: "Metrics",
    description: "Agree on definitions, drivers, and guardrails.",
  },
  {
    icon: Database,
    label: "Data",
    description: "Assess what exists, what links, and what is missing.",
  },
  {
    icon: BarChart3,
    label: "Insights",
    description: "Calculate evidence and make uncertainty visible.",
  },
  {
    icon: FileCheck2,
    label: "Action",
    description: "Turn evidence into decisions, pilots, and stories.",
  },
];

const collaborationRows = [
  ["Quality of Hire framework", "Change weights"],
  ["Metric definition", "Confirm company meaning"],
  ["Missing data plan", "Choose collection approach"],
  ["Analysis hypothesis", "Add business context"],
  ["Recommended action", "Decide what to execute"],
];

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[680px]">
      <div className="absolute -inset-5 -z-10 rounded-[20px] bg-[#dfe6f7]/55 blur-2xl" />
      <div className="overflow-hidden rounded-[12px] border border-[#cfd7e3] bg-white shadow-[0_18px_50px_rgba(27,43,78,0.12)]">
        <div className="flex h-10 items-center border-b border-[#e3e7ed] bg-[#fbfcfd] px-3">
          <div className="flex gap-1.5">
            <span className="size-2 rounded-full bg-[#cfd5df]" />
            <span className="size-2 rounded-full bg-[#cfd5df]" />
            <span className="size-2 rounded-full bg-[#cfd5df]" />
          </div>
          <div className="mx-auto flex h-5 w-[45%] items-center justify-center rounded-[4px] bg-[#f0f2f5] text-[7px] font-medium text-[#9099a8]">
            peopleanalyticsai.net/demo
          </div>
        </div>
        <div className="grid grid-cols-[112px_1fr_150px]">
          <div className="border-r border-[#e4e8ed] bg-[#fafbfc] p-3">
            <div className="mb-5 flex items-center gap-2">
              <div className="size-5 rounded-[4px] bg-[#3157c9]" />
              <div className="h-2 w-14 rounded bg-[#dbe0e8]" />
            </div>
            {["Strategy", "Measurement", "Data", "Analysis", "Action"].map(
              (item, index) => (
                <div
                  key={item}
                  className={`mb-1 flex h-8 items-center gap-2 rounded-[4px] px-2 ${
                    index === 3 ? "bg-[#ebf0fb]" : ""
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      index < 3 ? "bg-[#4b8b6d]" : index === 3 ? "bg-[#4164c6]" : "bg-[#c6ccd5]"
                    }`}
                  />
                  <span
                    className={`text-[7px] font-semibold ${
                      index === 3 ? "text-[#3152a9]" : "text-[#687385]"
                    }`}
                  >
                    {item}
                  </span>
                </div>
              ),
            )}
          </div>
          <div className="min-w-0 p-5">
            <div className="text-[6px] font-bold uppercase tracking-[0.12em] text-[#738097]">
              Executive answer
            </div>
            <h3 className="mt-2 max-w-[330px] text-[14px] font-bold leading-[1.3] tracking-[-0.02em] text-[#17243f]">
              Interview scheduling accounts for 44% of the Time to Fill gap
            </h3>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["59", "days current"],
                ["45", "days target"],
                ["14", "day gap"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-[5px] border border-[#e3e7ed] p-2.5">
                  <div className="text-[13px] font-bold text-[#203150]">{value}</div>
                  <div className="mt-0.5 text-[6px] text-[#7b8595]">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-[5px] border border-[#e3e7ed] p-3">
              <div className="flex items-end gap-2">
                {[35, 31, 68, 46, 42, 28].map((height, index) => (
                  <div key={index} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-t-[2px] ${
                        index === 2 ? "bg-[#4667c8]" : "bg-[#cfd6e3]"
                      }`}
                      style={{ height }}
                    />
                    <span className="h-1 w-full rounded bg-[#edf0f3]" />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[6px] font-medium text-[#4f5d73]">
                <span className="size-1.5 rounded-full bg-[#4667c8]" />
                Interview scheduling is the largest contributor
              </div>
            </div>
          </div>
          <div className="border-l border-[#e4e8ed] bg-[#fcfcfd] p-3">
            <div className="flex items-center gap-1.5 text-[7px] font-bold text-[#314361]">
              <Sparkles className="size-2.5 text-[#4d69bc]" />
              AI Co-Designer
            </div>
            <div className="mt-4 border-l-2 border-[#6f85ca] pl-2">
              <div className="text-[6px] font-bold uppercase tracking-[0.08em] text-[#566eb3]">
                Suggestion
              </div>
              <p className="mt-1 text-[7px] leading-3 text-[#687386]">
                Lead with the 14-day gap, then show the two largest contributors.
              </p>
            </div>
            <div className="mt-4 rounded-[5px] border border-[#dfe5f2] bg-[#f4f7fd] p-2">
              <div className="text-[6px] font-bold text-[#455ea8]">Evidence linked</div>
              <div className="mt-1 text-[7px] font-semibold text-[#344158]">
                High confidence
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-5 hidden rounded-[8px] border border-[#d8e1dc] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.09)] sm:block">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[#315f4b]">
          <ShieldCheck className="size-4" />
          Raw rows stay in your browser
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-[#111827]">
      <header className="sticky top-0 z-40 border-b border-[#e3e7ed] bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center px-5 sm:px-8">
          <Link href="/" aria-label="People Strategy Intelligence home">
            <BrandMark />
          </Link>
          <nav className="ml-auto hidden items-center gap-7 md:flex" aria-label="Main navigation">
            <a href="#how-it-works" className="text-[13px] font-medium text-[#586579] hover:text-[#25344f]">
              How it works
            </a>
            <a href="#co-design" className="text-[13px] font-medium text-[#586579] hover:text-[#25344f]">
              Human + AI
            </a>
            <Link href="/architecture" className="text-[13px] font-medium text-[#586579] hover:text-[#25344f]">
              Architecture
            </Link>
          </nav>
          <PrimaryLink href="/ask" className="ml-5 min-h-10 px-4" testId="header-ask">
            Ask a file
          </PrimaryLink>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-[#e6e9ee] bg-[#fbfcfe]">
          <div className="marketing-grid absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-[1240px] items-center gap-14 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[0.84fr_1.16fr] lg:py-28">
            <div className="max-w-[620px]">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dce3f3] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#425caa]">
                <span className="size-1.5 rounded-full bg-[#4a69c8]" />
                AI-native workforce intelligence
              </div>
              <h1 className="balanced text-[42px] font-[700] leading-[1.07] tracking-[-0.05em] text-[#13203a] sm:text-[56px]">
                Turn People Strategy Into a{" "}
                <span className="text-[#3157c9]">Measurement System</span>
              </h1>
              <p className="mt-6 max-w-[570px] text-[17px] leading-7 text-[#536177]">
                Define what matters, connect the right data, generate trusted insights,
                and move from strategy to action—with AI as your co-designer.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <PrimaryLink href="/ask" testId="hero-ask">
                  Ask a People file
                </PrimaryLink>
                <SecondaryLink href="/demo" testId="hero-demo">
                  Try the full strategy loop
                </SecondaryLink>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-[#dfe4eb] pt-6">
                {[
                  ["Deterministic analytics", BarChart3],
                  ["Local-first data", LockKeyhole],
                  ["Human-approved definitions", Check],
                ].map(([label, Icon]) => {
                  const FeatureIcon = Icon as typeof BarChart3;
                  return (
                    <span key={label as string} className="flex items-center gap-2 text-[11px] font-medium text-[#617086]">
                      <FeatureIcon className="size-3.5 text-[#4563b8]" />
                      {label as string}
                    </span>
                  );
                })}
              </div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section id="how-it-works" className="border-b border-[#e6e9ee] bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="eyebrow">One connected decision system</p>
              <h2 className="balanced mt-4 text-[32px] font-[680] tracking-[-0.04em] text-[#14213b] sm:text-[40px]">
                Start with the decision—not the dashboard
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-[#5c697e]">
                The platform creates a traceable path from business intent to approved
                metrics, usable data, evidence, and accountable action.
              </p>
            </div>
            <div className="mt-12 grid overflow-hidden rounded-[10px] border border-[#dfe4ea] bg-white md:grid-cols-5">
              {workflow.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.label}
                    className="relative border-b border-[#e6e9ee] p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
                  >
                    <div className="flex items-center justify-between">
                      <div className="grid size-9 place-items-center rounded-[7px] bg-[#eef2fb] text-[#3b5eb9]">
                        <Icon aria-hidden="true" className="size-4.5" />
                      </div>
                      {index < workflow.length - 1 && (
                        <ChevronRight className="hidden size-4 text-[#b2bac6] md:block" />
                      )}
                    </div>
                    <p className="mt-5 text-[15px] font-semibold text-[#21304b]">{step.label}</p>
                    <p className="mt-2 text-[12px] leading-5 text-[#677489]">{step.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="co-design" className="border-b border-[#e6e9ee] bg-[#f7f8fa] py-20 sm:py-24">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
            <div>
              <p className="eyebrow">Human + AI co-design</p>
              <h2 className="balanced mt-4 text-[32px] font-[680] tracking-[-0.04em] text-[#14213b] sm:text-[40px]">
                AI proposes.
                <br />
                People decide.
              </h2>
              <p className="mt-5 max-w-[450px] text-[15px] leading-7 text-[#5b687c]">
                Important definitions are never silently changed. AI structures the
                problem, explains trade-offs, and asks for confirmation. Your approved
                decisions become organizational knowledge.
              </p>
              <Link
                href="/architecture"
                className="mt-7 inline-flex items-center gap-2 text-[13px] font-semibold text-[#3156bc] hover:text-[#24469e]"
              >
                Explore the product architecture
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="overflow-hidden rounded-[10px] border border-[#dce1e8] bg-white">
              <div className="grid grid-cols-2 border-b border-[#e4e7ec] bg-[#fafbfc]">
                <div className="flex items-center gap-2 border-r border-[#e4e7ec] px-5 py-4 text-[12px] font-bold text-[#415b9f]">
                  <BrainCircuit className="size-4" />
                  AI proposes
                </div>
                <div className="flex items-center gap-2 px-5 py-4 text-[12px] font-bold text-[#2f614c]">
                  <Check className="size-4" />
                  Human decides
                </div>
              </div>
              {collaborationRows.map(([proposal, decision], index) => (
                <div
                  key={proposal}
                  className={`grid grid-cols-2 ${index < collaborationRows.length - 1 ? "border-b border-[#eaedf1]" : ""}`}
                >
                  <div className="border-r border-[#eaedf1] px-5 py-4 text-[13px] text-[#58667a]">
                    {proposal}
                  </div>
                  <div className="flex items-center justify-between gap-4 px-5 py-4 text-[13px] font-medium text-[#334158]">
                    {decision}
                    <ChevronRight className="size-3.5 shrink-0 text-[#a3abb8]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
            <div className="overflow-hidden rounded-[12px] border border-[#d7dfe9] bg-[#152343] text-white">
              <div className="fine-grid grid gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[1fr_0.8fr] lg:px-14 lg:py-14">
                <div>
                  <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.11em] text-[#b5c5fa]">
                    <Workflow className="size-4" />
                    Live synthetic portfolio demo
                  </div>
                  <h2 className="balanced mt-5 max-w-2xl text-[30px] font-[680] leading-[1.15] tracking-[-0.035em] sm:text-[38px]">
                    Diagnose why priority AI roles are missing their Time to Fill target
                  </h2>
                  <p className="mt-5 max-w-2xl text-[14px] leading-6 text-[#c2cada]">
                    Inspect the strategy, approve a metric definition, review local data
                    readiness, run deterministic analysis, and generate a five-slide
                    CHRO story.
                  </p>
                  <PrimaryLink
                    href="/demo"
                    className="mt-7 bg-white text-[#243f91] hover:bg-[#eef2ff]"
                    testId="footer-demo"
                  >
                    Launch the demo
                  </PrimaryLink>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {[
                    ["No sign-in", "Explore the complete workflow immediately."],
                    ["Synthetic enterprise data", "Realistic signals, gaps, and mapping issues."],
                    ["Evidence you can audit", "Every conclusion links to a definition and limitation."],
                  ].map(([title, description]) => (
                    <div key={title} className="rounded-[8px] border border-white/14 bg-white/6 p-4">
                      <div className="flex items-center gap-2 text-[13px] font-semibold">
                        <Check className="size-4 text-[#9db2f4]" />
                        {title}
                      </div>
                      <p className="mt-2 pl-6 text-[11px] leading-5 text-[#adb8ca]">{description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e2e6eb] bg-[#f8f9fb]">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <BrandMark />
          <p className="text-[11px] text-[#758094]">
            Built to operationalize People Analytics judgment—not replace it.
          </p>
          <div className="flex gap-5 text-[11px] font-medium text-[#5f6c81]">
            <Link href="/architecture" className="hover:text-[#2f4fa9]">
              Architecture
            </Link>
            <Link href="/ask" className="hover:text-[#2f4fa9]">
              Ask a file
            </Link>
            <Link href="/demo" className="hover:text-[#2f4fa9]">
              Demo
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
