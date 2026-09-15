import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { WhyIBuiltThis } from "@/components/enterprise-demo/DemoShell";
import { CASE_PROOF } from "@/lib/people/architecture-map";
import { CASES } from "@/lib/people/demo-cases";
import { LAYER_TONE } from "@/lib/people/layer-tones";
import { pageMetadata } from "@/lib/site-metadata";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "Enterprise Demo",
  description:
    "Three People Analytics case studies on one governed platform: trusted Headcount, an HRIS incident replay, and Engineering attrition.",
  path: "/enterprise-demo",
});

const CASE_CTAS = {
  trust: "Explore trusted Headcount",
  incident: "Replay the incident",
  attrition: "Explore the analysis",
} as const;

export default function EnterpriseDemoLandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SiteHeader active="/enterprise-demo" />
      <main className="w-full flex-1 mx-auto max-w-[980px] px-5 py-10 sm:px-8">
        <p className="eyebrow">Enterprise Demo</p>
        <h1 className="mt-3 max-w-3xl text-[36px] font-bold leading-[1.12] tracking-[-0.04em] text-ink sm:text-[42px]">
          <span className="hl hl-certified">Trusted</span> workforce numbers, then intelligence, then{" "}
          <span className="hl hl-ai">AI</span>.
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-7 text-body-2">
          Three case studies. One click each. The same governed People platform underneath.
        </p>
        <p className="mt-3 text-[13px] font-medium text-primary-deep" data-testid="synthetic-label">
          GlobalTech · Synthetic Enterprise People Dataset · not a real company
        </p>

        <div className="mt-8 grid gap-4" data-testid="demo-cases">
          {CASES.map((item, index) => {
            const tone = LAYER_TONE[CASE_PROOF[item.id].layers[0]];
            return (
              <Link
                key={item.id}
                href={item.href}
                data-testid={`case-card-${item.id}`}
                className="surface group relative block overflow-hidden p-5 pl-6 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", tone.solid)} />
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                  <span
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-[5px] text-[10px] text-white",
                      tone.solid,
                    )}
                  >
                    {index + 1}
                  </span>
                  {item.subtitle}
                </p>
                <h2 className="mt-2 text-[22px] font-bold tracking-[-0.03em] text-ink">
                  {item.question}
                </h2>
                <p className="mt-2 text-[14px] leading-6 text-body-2">{item.description}</p>
                <span className="mt-3 inline-block text-[13px] font-semibold text-primary group-hover:underline">
                  {CASE_CTAS[item.id]}
                </span>
              </Link>
            );
          })}
        </div>
        <WhyIBuiltThis />
      </main>
      <SiteFooter />
    </div>
  );
}
