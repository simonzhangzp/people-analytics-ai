"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { asRecord } from "@/lib/people/format";

export function MetricDefinitionButton({
  definition,
  label = "Certified metric · View definition",
}: {
  definition: Record<string, unknown>;
  label?: string;
}) {
  const def = asRecord(definition);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-[12px] font-semibold text-primary hover:underline"
          data-testid="metric-definition-trigger"
        >
          {label}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{String(def.metric_name ?? def.metric_id ?? "Metric")}</DialogTitle>
          <DialogDescription>
            {String(def.owner ?? "People Analytics")} · version {String(def.version ?? 1)} ·{" "}
            {String(def.status ?? "certified")}
          </DialogDescription>
        </DialogHeader>
        <dl className="mt-4 space-y-3 text-[13px] leading-6 text-body">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              Grain (must match the figure on the page)
            </dt>
            <dd className="mt-1">
              metric_id {String(def.metric_id ?? "—")} · Scope {String(def.scope ?? "—")} · Window{" "}
              {String(def.window ?? def.time_logic ?? "—")} · as_of {String(def.as_of ?? "—")}
              {def.annualized === true ? " · annualized" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              Business definition
            </dt>
            <dd className="mt-1">{String(def.business_definition ?? "—")}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Formula</dt>
            <dd className="mt-1 font-mono text-[12px]">{String(def.formula ?? "—")}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Formula SQL</dt>
            <dd className="mt-1 font-mono text-[12px]">{String(def.formula_sql ?? "—")}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Population</dt>
            <dd className="mt-1">{String(def.population_rules ?? "—")}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Exclusions</dt>
            <dd className="mt-1">{String(def.exclusions ?? "—")}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Time logic</dt>
            <dd className="mt-1">{String(def.time_logic ?? "—")}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Lineage</dt>
            <dd className="mt-1">
              Sources: {Array.isArray(def.source_tables) ? def.source_tables.join(", ") : "—"}
              <br />
              Marts: {Array.isArray(def.downstream_marts) ? def.downstream_marts.join(", ") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Quality</dt>
            <dd className="mt-1">{String(def.quality_status ?? "—")}</dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
