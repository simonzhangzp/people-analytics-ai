import Link from "next/link";
import { LiveTag } from "@/components/site/LiveTag";
import { LAYER_TONE, PILLAR_TONE, type LayerTone } from "@/lib/people/layer-tones";
import { COMPARISON_ROWS, type ComparisonRow } from "@/lib/people/comparison";
import { CASES } from "@/lib/people/demo-cases";
import { cn } from "@/lib/utils";

function caseLabel(id: string) {
  return CASES.find((row) => row.id === id)?.question ?? id;
}

function caseHref(id: string) {
  return CASES.find((row) => row.id === id)?.href ?? "/enterprise-demo";
}

function toneFor(row: ComparisonRow): LayerTone {
  return row.accent in LAYER_TONE
    ? LAYER_TONE[row.accent as keyof typeof LAYER_TONE]
    : PILLAR_TONE[row.accent as keyof typeof PILLAR_TONE];
}

function Cross() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="mt-[7px] size-2.5 shrink-0 text-faint">
      <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="mt-[7px] size-2.5 shrink-0 text-certified">
      <path d="M2 6.5 L4.8 9.2 L10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Section 1 — Traditional vs AI-Ready, one dimension per row, both sides visible at once.
 * Left column is the dimension; middle is the traditional approach; right is what this site
 * actually does. Each row carries the colour of the architecture layer it exercises.
 */
export function ComparisonRail() {
  return (
    <section className="mt-28" data-testid="home-comparison" aria-labelledby="comparison-title">
      <p className="eyebrow">Five differences</p>
      <h2 id="comparison-title" className="section-title mt-3 max-w-3xl">
        People Analytics was built for <span className="hl hl-ink">dashboards</span>. AI requires a{" "}
        <span className="hl hl-ai">different architecture</span>.
      </h2>
      <p className="lede mt-4 max-w-3xl">
        Five places where a dashboard-era stack breaks the moment an AI starts asking it questions.
        Left: how most People Analytics teams still run. Right:{" "}
        <strong className="font-semibold text-certified-dark">what this site runs today</strong>; the one
        row that is still roadmap says so.
      </p>

      <div className="surface mt-10 overflow-hidden" role="table" aria-label="Traditional vs AI-ready People Analytics">
        {/* Column headers (desktop) */}
        <div
          role="row"
          className="hidden border-b border-edge md:grid md:grid-cols-[minmax(200px,0.9fr)_minmax(0,1.3fr)_minmax(0,1.3fr)]"
        >
          <div role="columnheader" className="px-6 py-4 text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
            Dimension
          </div>
          <div role="columnheader" className="border-l border-edge bg-canvas-2/70 px-6 py-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Traditional People Analytics</p>
            <p className="mt-0.5 text-[12px] text-faint">Dashboards first, AI bolted on top</p>
          </div>
          <div role="columnheader" className="border-l border-edge bg-primary-soft/60 px-6 py-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-primary-deep">AI-Ready People Analytics</p>
            <p className="mt-0.5 text-[12px] text-primary-deep/70">What this site runs today</p>
          </div>
        </div>

        {COMPARISON_ROWS.map((row, index) => {
          const tone = toneFor(row);
          return (
            <div
              role="row"
              key={row.id}
              data-testid={`comparison-row-${row.id}`}
              className={cn(
                "grid md:grid-cols-[minmax(200px,0.9fr)_minmax(0,1.3fr)_minmax(0,1.3fr)]",
                index > 0 && "border-t border-edge",
              )}
            >
              {/* Dimension */}
              <div role="rowheader" className="relative px-6 pb-4 pt-6 md:pb-6">
                <span aria-hidden="true" className={cn("absolute inset-y-6 left-0 w-1 rounded-r-full", tone.solid)} />
                <p className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.08em]">
                  <span
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-[5px] text-[10px] tabular-nums text-white",
                      tone.solid,
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className={tone.text}>
                    {row.accent.startsWith("L") ? `Layer ${row.accent}` : "Governance pillar"}
                  </span>
                </p>
                <h3 className="display mt-2 text-[20px] font-bold leading-tight tracking-[-0.02em] text-ink">
                  {row.title}
                </h3>
                <p className="mt-3 text-[14px] font-medium leading-6 text-body-2">{row.thesis}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                  {row.tryHref ? (
                    <Link href={row.tryHref} className="font-semibold text-primary hover:underline">
                      Try it yourself
                    </Link>
                  ) : null}
                  {row.cases.map((id) => (
                    <Link key={id} href={caseHref(id)} className="font-medium text-muted hover:text-primary">
                      {caseLabel(id)}
                    </Link>
                  ))}
                </div>
                {row.status === "target" ? <LiveTag status="target" compact className="mt-3" /> : null}
              </div>

              {/* Traditional */}
              <div role="cell" className="border-t border-edge bg-canvas-2/70 px-6 py-5 md:border-l md:border-t-0 md:py-6">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted md:hidden">
                  Traditional People Analytics
                </p>
                <ul className="space-y-2.5">
                  {row.traditional.map((line) => (
                    <li key={line} className="flex gap-2.5 text-[14px] leading-6 text-body-2">
                      <Cross />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* AI-ready */}
              <div role="cell" className="border-t border-edge bg-primary-soft/35 px-6 py-5 md:border-l md:border-t-0 md:py-6">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-primary-deep md:hidden">
                  AI-Ready People Analytics
                </p>
                <ul className="space-y-2.5">
                  {row.aiReady.map((line) => (
                    <li key={line} className="flex gap-2.5 text-[14px] font-medium leading-6 text-ink">
                      <Check />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                {row.status === "target" ? (
                  <p className="mt-3 text-[12px] leading-5 text-gold-dark">
                    Live today: 15 governed tools and deterministic case skeletons. The skills registry is roadmap.
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
