"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Circle,
  DatabaseZap,
  GitBranch,
  LoaderCircle,
  Pin,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InsightChart } from "./InsightChart";
import type { DataRow } from "@/types/local-data";
import type {
  AnalysisPlan,
  AnalysisQuestion,
  Insight,
} from "@/types/workbench";

const GraphicWalkerPanel = dynamic(() => import("./GraphicWalkerPanel"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#101828]/35">
      <div className="rounded-[8px] bg-white px-5 py-4 text-[12px] font-semibold text-[#41506a] shadow-lg">
        Loading local explorer…
      </div>
    </div>
  ),
});

interface AnalysisCanvasProps {
  question: AnalysisQuestion | null;
  plan: AnalysisPlan | null;
  insights: Insight[];
  running: boolean;
  explorationRows: DataRow[];
  explorationSource: string;
  onRunPlan: () => Promise<void> | void;
  onRunBranch: (branch: Insight["branchKey"]) => Promise<void> | void;
  onToggleStory: (insightId: string) => void;
  onContinueToStory: () => void;
}

export function AnalysisCanvas({
  question,
  plan,
  insights,
  running,
  explorationRows,
  explorationSource,
  onRunPlan,
  onRunBranch,
  onToggleStory,
  onContinueToStory,
}: AnalysisCanvasProps) {
  const [explorerOpen, setExplorerOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-5 py-8 sm:px-8 lg:px-10">
      <header className="border-b border-[#dfe3e9] pb-7">
        <p className="eyebrow">Analysis · Auditable finding thread</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="max-w-3xl text-[28px] font-semibold leading-[1.2] tracking-[-0.035em] text-[#14213b] sm:text-[32px]">
              {question?.text ?? "What should the analysis establish?"}
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#5d697c]">
              Review the plan first. Calculations then run from approved definitions in
              the local engine, and each finding opens the next defensible branch.
            </p>
          </div>
          {insights.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setExplorerOpen(true)}>
                <Search aria-hidden="true" className="size-4" />
                Explore data
              </Button>
              <Button onClick={onContinueToStory} data-testid="continue-to-story">
                Build executive story
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </header>

      <section className="mt-7" aria-labelledby="analysis-plan-heading">
        <div className="rounded-[9px] border border-[#dfe3e9] bg-white">
          <div className="flex flex-col gap-4 border-b border-[#e6e9ee] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch aria-hidden="true" className="size-4 text-[#4865b4]" />
                <h2
                  id="analysis-plan-heading"
                  className="text-[14px] font-semibold text-[#26344d]"
                >
                  Analysis plan
                </h2>
                <Badge variant={insights.length ? "success" : "info"}>
                  {insights.length ? "Executed" : "Review before run"}
                </Badge>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-[#687386]">
                {plan?.summary ??
                  "Confirm metric definitions and field relationships to create a plan."}
              </p>
            </div>
            {plan && insights.length === 0 && (
              <Button onClick={() => void onRunPlan()} disabled={running} data-testid="run-analysis-plan">
                {running ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Play aria-hidden="true" className="size-4" />
                )}
                {running ? "Calculating locally…" : "Run approved plan"}
              </Button>
            )}
          </div>

          <ol className="divide-y divide-[#edf0f3]">
            {plan?.steps.map((step, index) => (
              <li key={step.id} className="flex items-start gap-3 px-5 py-4">
                <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-[#d6dce8] bg-[#f7f8fb] text-[10px] font-bold text-[#66748b]">
                  {step.status === "complete" ? (
                    <Check aria-label="Complete" className="size-3.5 text-[#3f7d61]" />
                  ) : step.status === "running" ? (
                    <LoaderCircle
                      aria-label="Running"
                      className="size-3.5 animate-spin text-[#4563b3]"
                    />
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-[#3a475d]">
                    {step.objective}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.07em] text-[#8992a1]">
                    {step.operation.replaceAll("_", " ")}
                    {step.dimensions?.length
                      ? ` · ${step.dimensions.join(", ")}`
                      : ""}
                  </p>
                  {step.blockedReason && (
                    <p className="mt-2 text-[11px] leading-4 text-[#8a5d25]">
                      {step.blockedReason}
                    </p>
                  )}
                </div>
                {step.status === "complete" ? (
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-[#3f7d61]"
                  />
                ) : step.status === "blocked" ? (
                  <DatabaseZap
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-[#af722c]"
                  />
                ) : (
                  <Circle
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-[#c1c7d0]"
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {insights.length > 0 && (
        <section className="mt-8" aria-labelledby="finding-thread-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2
                id="finding-thread-heading"
                className="text-[15px] font-semibold text-[#24324a]"
              >
                Finding thread
              </h2>
              <p className="mt-1 text-[12px] text-[#717b8b]">
                Conclusions first, then exact evidence, limits, and the next branch.
              </p>
            </div>
            <Badge variant="success">{insights.length} validated findings</Badge>
          </div>

          <div className="relative mt-5 space-y-5 before:absolute before:bottom-6 before:left-[17px] before:top-6 before:w-px before:bg-[#ccd5e6]">
            {insights.map((insight, index) => (
              <article
                key={insight.id}
                className="relative ml-9 rounded-[9px] border border-[#dfe3e9] bg-white"
                data-testid={`insight-${insight.branchKey}`}
              >
                <span
                  aria-hidden="true"
                  className="absolute -left-[31px] top-6 grid size-5 place-items-center rounded-full border-2 border-white bg-[#4966b3] text-[8px] font-bold text-white shadow-[0_0_0_1px_#b9c5df]"
                >
                  {index + 1}
                </span>

                <div className="border-b border-[#e6e9ee] px-5 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info">{insight.branchKey}</Badge>
                    <Badge variant={insight.confidence === "High" ? "success" : "warning"}>
                      {insight.confidence} confidence
                    </Badge>
                    {insight.validated && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#3f7d61]">
                        <ShieldCheck aria-hidden="true" className="size-3" />
                        Deterministic result
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="max-w-3xl text-[19px] font-semibold leading-7 tracking-[-0.02em] text-[#1e2b43]">
                        {insight.headline}
                      </h3>
                      <p className="mt-2 text-[12px] leading-5 text-[#657185]">
                        {insight.finding}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={insight.selectedForExecutiveStory ? "primary" : "secondary"}
                      onClick={() => onToggleStory(insight.id)}
                      aria-pressed={insight.selectedForExecutiveStory}
                    >
                      {insight.selectedForExecutiveStory ? (
                        <Check aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Pin aria-hidden="true" className="size-3.5" />
                      )}
                      {insight.selectedForExecutiveStory
                        ? "Added to Story"
                        : "Add to Story"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                    {insight.chartSpec && <InsightChart spec={insight.chartSpec} />}
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {insight.evidence.slice(0, 3).map((evidence) => (
                        <div
                          key={evidence.id}
                          className="rounded-[6px] border border-[#e1e5eb] bg-[#fafbfc] px-3 py-3"
                        >
                          <p className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#8a93a2]">
                            {evidence.label}
                          </p>
                          <p className="mt-1 text-[15px] font-semibold tabular-nums text-[#273650]">
                            {evidence.value}
                          </p>
                          {evidence.detail && (
                            <p className="mt-1 text-[10px] leading-4 text-[#798293]">
                              {evidence.detail}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#87909f]">
                        Population & period
                      </p>
                      <p className="mt-2 text-[11px] leading-5 text-[#536076]">
                        {insight.population}
                        {insight.period ? ` · ${insight.period}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[#87909f]">
                        <TriangleAlert aria-hidden="true" className="size-3" />
                        Limits
                      </p>
                      <ul className="mt-2 space-y-2 text-[11px] leading-4 text-[#6b7484]">
                        {insight.limitations.map((limitation) => (
                          <li key={limitation}>• {limitation}</li>
                        ))}
                      </ul>
                    </div>
                  </aside>
                </div>

                {insight.suggestedFollowUps.length > 0 && (
                  <div className="border-t border-[#e7eaf0] bg-[#fafbfc] px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mr-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[#7d8797]">
                        <Sparkles aria-hidden="true" className="size-3.5 text-[#4966b3]" />
                        Follow the evidence
                      </span>
                      {insight.suggestedFollowUps.map((followUp) => (
                        <Button
                          key={`${insight.id}-${followUp.key}`}
                          size="sm"
                          variant="secondary"
                          disabled={!followUp.available || running}
                          title={followUp.unavailableReason}
                          onClick={() => void onRunBranch(followUp.key)}
                        >
                          {followUp.available ? (
                            <BarChart3 aria-hidden="true" className="size-3.5" />
                          ) : (
                            <DatabaseZap aria-hidden="true" className="size-3.5" />
                          )}
                          {followUp.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {running && insights.length > 0 && (
        <div className="mt-5 flex items-center gap-2 rounded-[7px] border border-[#d8e0f3] bg-[#f4f6fc] px-4 py-3 text-[12px] text-[#4b5f91]">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Running the selected branch in local DuckDB…
        </div>
      )}

      {explorerOpen && (
        <GraphicWalkerPanel
          open={explorerOpen}
          onOpenChange={setExplorerOpen}
          rows={explorationRows}
          sourceLabel={explorationSource}
          sampled={explorationRows.length >= 5_000}
        />
      )}
    </div>
  );
}

