import Link from "next/link";
import { ARCHITECTURE_PILLARS, CASE_PROOF, layerById } from "@/lib/people/architecture-map";
import { CASES } from "@/lib/people/demo-cases";
import { LAYER_TONE } from "@/lib/people/layer-tones";
import { cn } from "@/lib/utils";

const CASE_CTAS = {
  trust: "See why the number holds",
  incident: "Replay the incident",
  attrition: "Read evidence vs hypotheses",
} as const;

/** Cases rendered as proof points of the architecture, not as isolated cards. */
export function ProofPoints() {
  return (
    <section className="mt-28" data-testid="home-cases" aria-labelledby="proof-title">
      <p className="eyebrow">Proof points</p>
      <h2 id="proof-title" className="section-title mt-3 max-w-3xl">
        Three questions the architecture has to <span className="hl hl-ai">answer</span>.
      </h2>
      <p className="lede mt-4 max-w-3xl">
        Each case exercises specific layers. Trust the number, separate a feed failure from a
        workforce change, then analyse without confusing correlation with cause.
      </p>
      <ol className="mt-10 grid gap-4 lg:grid-cols-3">
        {CASES.map((item, index) => {
          const proof = CASE_PROOF[item.id];
          const primaryLayer = proof.layers[0];
          const tone = LAYER_TONE[primaryLayer];
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                data-testid={`case-card-${item.id}`}
                className={cn(
                  "surface group relative flex h-full flex-col overflow-hidden p-6 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lift",
                  proof.emphasis && "ring-1 ring-primary-ring",
                )}
              >
                <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", tone.solid)} />
                <p className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted">
                  <span className={cn("inline-flex size-5 items-center justify-center rounded-[5px] text-[10px] text-white", tone.solid)}>
                    {index + 1}
                  </span>
                  {item.subtitle}
                </p>
                <h3 className="display mt-3 text-[22px] font-bold leading-snug tracking-[-0.02em] text-ink">
                  {item.question}
                </h3>
                <p className="mt-3 text-[15px] font-medium leading-6 text-body-2">{proof.thesis}</p>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {proof.layers.map((id) => (
                    <span
                      key={id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        LAYER_TONE[id].soft,
                        LAYER_TONE[id].text,
                      )}
                    >
                      {id} {layerById(id).name}
                    </span>
                  ))}
                  {proof.pillars.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center rounded-full border border-edge bg-canvas-2 px-2 py-0.5 text-[11px] font-semibold text-body-2"
                    >
                      {ARCHITECTURE_PILLARS.find((row) => row.id === id)?.name}
                    </span>
                  ))}
                </div>
                <span className="mt-auto pt-6 text-[13px] font-semibold text-primary group-hover:underline">
                  {CASE_CTAS[item.id]}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
