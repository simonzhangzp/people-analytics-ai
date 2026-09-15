import Link from "next/link";
import { formatCount } from "@/lib/people/format";
import type { HomePlatformFacts } from "@/lib/people/platform-facts";
import { LAYER_TONE } from "@/lib/people/layer-tones";
import { cn } from "@/lib/utils";

type Step = {
  id: string;
  who: string;
  what: string;
  detail: string;
  hex: string;
};

/**
 * Hero artifact: one governed answer with its provenance. This is the most characteristic
 * object in the product — a number that arrives with identity, tool, policy and trace attached.
 * The value is the live certified Headcount from the serving RPC; nothing here is typed by hand.
 */
export function ProvenanceCard({ facts }: { facts: HomePlatformFacts }) {
  const value = facts.headcount == null ? "—" : formatCount(facts.headcount);
  const steps: Step[] = [
    {
      id: "identity",
      who: "Policy",
      what: "Identity resolved",
      detail: "demo-external-viewer · aggregate only · min_cell 50",
      hex: "#0b1730",
    },
    {
      id: "tool",
      who: "Model",
      what: "Tool selected, not SQL written",
      detail: "people_get_metric_for(headcount)",
      hex: LAYER_TONE.L4.hex,
    },
    {
      id: "value",
      who: "SQL",
      what: "Certified value computed",
      detail: `people_metric.headcount · v1 · as of ${facts.asOf}`,
      hex: LAYER_TONE.L2.hex,
    },
    {
      id: "trace",
      who: "Trace",
      what: "Every step logged",
      detail: "identity · tool sequence · policy · suppression",
      hex: "#5f6b82",
    },
  ];

  return (
    <aside
      aria-label="A governed answer with its provenance"
      data-testid="hero-provenance"
      className="band-ink relative overflow-hidden rounded-[16px] p-6 shadow-lift sm:p-7"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-on-ink-eyebrow">A governed answer</p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-on-ink-2">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-on-ink-certified" />
          Live from serving
        </span>
      </div>

      <p className="mt-4 text-[15px] leading-6 text-on-ink-2">
        <span className="text-on-ink-muted">Asked as an external viewer:</span> “What is our current
        headcount?”
      </p>

      <div className="mt-5 flex items-end justify-between gap-4 rounded-[12px] border border-white/10 bg-white/5 px-5 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-on-ink-muted">Certified Headcount</p>
          <p className="display mt-1 text-[44px] font-bold leading-none tracking-[-0.04em] text-white tabular-nums sm:text-[52px]">
            {value}
          </p>
        </div>
        <div className="text-right text-[12px] leading-5 text-on-ink-3">
          <p>as of {facts.asOf}</p>
          <p className="font-semibold text-on-ink-certified">status: certified</p>
        </div>
      </div>

      <ol className="mt-5 space-y-0">
        {steps.map((step, index) => (
          <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className="absolute left-[7px] top-4 h-full w-px bg-white/12" />
            ) : null}
            <span
              aria-hidden="true"
              className="mt-[5px] size-[15px] shrink-0 rounded-full border-[3px] border-ink"
              style={{ backgroundColor: step.hex, boxShadow: `0 0 0 1px ${step.hex}` }}
            />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white">
                <span className={cn("mr-2 text-[11px] font-bold uppercase tracking-[0.08em] text-on-ink-muted")}>
                  {step.who}
                </span>
                {step.what}
              </p>
              <p className="truncate font-mono text-[11.5px] text-on-ink-3">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-[12.5px]">
        <p className="text-on-ink-3">
          The model chose the tool. <span className="font-semibold text-white">SQL produced the number.</span>
        </p>
        <Link href="/try#trace" className="font-semibold text-on-ink-link hover:text-white">
          Trace it yourself
        </Link>
      </div>
    </aside>
  );
}
