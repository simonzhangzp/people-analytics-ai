"use client";

import { useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronRight,
  FilePlus2,
  GitBranch,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import type { CapabilityReport } from "@/types/semantics";
import type {
  AnalysisPlan,
  DataThreadTurn,
  Insight,
  LocalWorkbenchDataset,
  MetricAmbiguity,
} from "@/types/workbench";
import { InsightChart } from "./InsightChart";

interface AnalyzeCanvasProps {
  datasets: LocalWorkbenchDataset[];
  capabilities: CapabilityReport[];
  activeDatasetId?: string;
  localDataAvailable: boolean;
  questionText: string;
  processing: boolean;
  processingMessage?: string;
  busy: boolean;
  error?: string;
  thread: DataThreadTurn[];
  insights: Insight[];
  ambiguity: MetricAmbiguity | null;
  plan: AnalysisPlan | null;
  onAddFiles: (files: File[]) => Promise<void> | void;
  onSelectDataset: (id: string) => void;
  onQuestionTextChange: (value: string) => void;
  onAskQuestion: (questionText?: string, parentTurnId?: string) => void;
  onResolveAmbiguity: (optionId: string) => void;
  onToggleStory: (insightId: string) => void;
}

function excelColumn(index: number | undefined) {
  if (index === undefined) return "";
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function AnalyzeCanvas({
  datasets,
  capabilities,
  activeDatasetId,
  localDataAvailable,
  questionText,
  processing,
  processingMessage,
  busy,
  error,
  thread,
  insights,
  ambiguity,
  plan,
  onAddFiles,
  onSelectDataset,
  onQuestionTextChange,
  onAskQuestion,
  onResolveAmbiguity,
  onToggleStory,
}: AnalyzeCanvasProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);
  const [branchParentId, setBranchParentId] = useState<string>();
  const [changingTurnId, setChangingTurnId] = useState<string>();
  const active =
    datasets.find(({ metadata }) => metadata.id === activeDatasetId) ??
    datasets[0];
  const requiresFileReattach =
    datasets.length > 0 && !localDataAvailable;

  const acceptFiles = (list: FileList | null) => {
    if (!list?.length) return;
    void onAddFiles(Array.from(list).slice(0, 10));
  };

  const submit = () => {
    if (
      !questionText.trim() ||
      processing ||
      busy ||
      requiresFileReattach
    ) {
      return;
    }
    onAskQuestion(undefined, branchParentId);
    setBranchParentId(undefined);
  };

  return (
    <div className="mx-auto w-full max-w-[980px] px-5 py-7 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 border-b border-[#dfe3e9] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Analyze · Data thread</p>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.18] tracking-[-0.035em] text-[#14213b] sm:text-[32px]">
            Ask your People data anything.
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#5d697c]">
            AI understands the meaning. Code does the math. You stay in control.
          </p>
        </div>
        <Badge variant="success">
          <ShieldCheck aria-hidden="true" className="size-3" />
          Raw rows stay local
        </Badge>
      </header>

      <section className="mt-6" aria-label="Local People files">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.xlsx"
          className="sr-only"
          onChange={(event) => {
            acceptFiles(event.target.files);
            event.target.value = "";
          }}
          data-testid="workbench-file-input"
        />
        <div
          className={cn(
            "rounded-[9px] border border-dashed bg-white transition-colors",
            datasets.length === 0 ? "px-6 py-9 text-center" : "px-4 py-3",
            dragging
              ? "border-[#6f87cc] bg-[#f1f4fc]"
              : requiresFileReattach
                ? "border-[#e4cfae] bg-[#fffaf2]"
                : "border-[#cfd5df] hover:border-[#aeb9ca]",
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFiles(event.dataTransfer.files);
          }}
          data-testid="workbench-file-dropzone"
        >
          {processing ? (
            <div className="flex items-center justify-center gap-3">
              <LoaderCircle
                aria-hidden="true"
                className="size-5 animate-spin text-[#4563b3]"
              />
              <div className={datasets.length ? "text-left" : ""}>
                <p className="text-[13px] font-semibold text-[#344158]">
                  {processingMessage ?? "Understanding your files locally…"}
                </p>
                <p className="mt-0.5 text-[11px] text-[#808999]">
                  Profiling fields and preparing deterministic queries.
                </p>
              </div>
            </div>
          ) : datasets.length === 0 ? (
            <>
              <div className="mx-auto grid size-10 place-items-center rounded-[7px] border border-[#dfe5f2] bg-[#f4f6fc] text-[#3a5ab4]">
                <FilePlus2 aria-hidden="true" className="size-5" />
              </div>
              <p className="mt-3 text-[14px] font-semibold text-[#344158]">
                Drop a CSV or XLSX file, then ask a question
              </p>
              <p className="mt-1 text-[11px] text-[#808999]">
                Up to 10 files and every valid worksheet. No mapping screen required.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => inputRef.current?.click()}
              >
                Choose local files
              </Button>
            </>
          ) : requiresFileReattach ? (
            <div
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
              data-testid="reattach-local-files"
            >
              <TriangleAlert
                aria-hidden="true"
                className="size-5 shrink-0 text-[#9a6b32]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-[#5e492f]">
                  Reattach local files to continue
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-[#7b674d]">
                  Previous answers remain visible. Raw rows were intentionally
                  not retained when this page reloaded.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <FilePlus2 aria-hidden="true" className="size-4" />
                Reattach files
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-[#344158]">
                  {datasets.length} local dataset{datasets.length === 1 ? "" : "s"} ready
                </p>
                <p className="mt-0.5 text-[10px] text-[#7b8494]">
                  {formatNumber(
                    datasets.reduce(
                      (sum, dataset) => sum + dataset.metadata.rowCount,
                      0,
                    ),
                  )}{" "}
                  observed rows · raw data remains in this browser
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <FilePlus2 aria-hidden="true" className="size-4" />
                Add files
              </Button>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-[7px] border border-[#d9e4dd] bg-[#f6faf7] px-4 py-2.5 text-[10px] leading-4 text-[#4d6959]">
          <LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Raw employee rows remain session-only. Only schema, definitions, and
          aggregate evidence may be used for AI explanation or saved knowledge.
        </div>
        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-[7px] border border-[#edd4d1] bg-[#fdf7f6] px-4 py-3 text-[12px] text-[#8b4841]"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
      </section>

      <section
        className="mt-5 rounded-[9px] border border-[#cfd9ef] bg-white p-4"
        aria-labelledby="ask-heading"
      >
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-[#4563b3]" />
          <h2 id="ask-heading" className="text-[13px] font-semibold text-[#26344d]">
            {branchParentId
              ? `Branching from answer ${
                  thread.findIndex((turn) => turn.id === branchParentId) + 1
                }`
              : thread.length
                ? "Continue the analysis"
                : "What do you want to know?"}
          </h2>
          {branchParentId && (
            <button
              type="button"
              onClick={() => setBranchParentId(undefined)}
              className="ml-auto text-[10px] font-semibold text-[#667287] hover:text-[#334158]"
            >
              Cancel branch
            </button>
          )}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <label htmlFor="workbench-question" className="sr-only">
            People Analytics question
          </label>
          <textarea
            ref={questionRef}
            id="workbench-question"
            value={questionText}
            onChange={(event) => onQuestionTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            disabled={!datasets.length || processing || requiresFileReattach}
            placeholder={
              requiresFileReattach
                ? "Reattach the local source file to continue"
                : datasets.length
                ? "e.g. Headcount by country"
                : "Attach a People file first"
            }
            className="min-h-[54px] flex-1 resize-none rounded-[7px] border border-[#cbd3df] px-4 py-3 text-[13px] leading-5 text-[#2f3d55] outline-none focus:border-[#8196d1] focus:ring-2 focus:ring-[#3157d5]/10 disabled:bg-[#f5f6f8]"
            data-testid="workbench-question"
          />
          <Button
            size="icon"
            aria-label={thread.length ? "Continue analysis" : "Analyze question"}
            disabled={
              !questionText.trim() ||
              processing ||
              busy ||
              requiresFileReattach
            }
            onClick={submit}
            data-testid="ask-workbench-question"
          >
            {busy ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ArrowUp aria-hidden="true" className="size-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-[#858e9d]">
          {requiresFileReattach
            ? "Reattach the same source to preserve this Data Thread."
            : "Press Enter to ask · Shift+Enter for a new line"}
        </p>
      </section>

      <section className="mt-7" aria-label="Analysis data thread">
        {thread.length === 0 ? (
          <div className="rounded-[9px] border border-[#e1e5eb] bg-white px-5 py-6">
            <MessageSquareText
              aria-hidden="true"
              className="size-5 text-[#71809b]"
            />
            <p className="mt-3 text-[13px] font-semibold text-[#3d4a60]">
              Your answers will build one continuous Data Thread.
            </p>
            <p className="mt-1 max-w-xl text-[11px] leading-5 text-[#768092]">
              Ask for a cut, continue with a trend, or branch from any finding.
              Metric definitions and query plans stay available as method details,
              not mandatory steps.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {thread.map((turn, turnIndex) => {
              const turnInsights = turn.insightIds
                .map((id) => insights.find((insight) => insight.id === id))
                .filter((insight): insight is Insight => Boolean(insight));
              const isCurrentAmbiguity =
                turn.status === "needs_confirmation" && Boolean(ambiguity);
              const showDefinitionChange =
                changingTurnId === turn.id && Boolean(turn.definitionAmbiguity);
              const showMethodDetails =
                changingTurnId === turn.id && !turn.definitionAmbiguity;
              return (
                <article
                  key={turn.id}
                  className="relative pl-5 before:absolute before:bottom-[-32px] before:left-[7px] before:top-7 before:w-px before:bg-[#dfe3e9] last:before:hidden sm:pl-7"
                  data-testid="data-thread-turn"
                >
                  <div className="absolute left-0 top-1 grid size-4 place-items-center rounded-full border border-[#bcc8e3] bg-[#eef2fb] text-[8px] font-bold text-[#405faa]">
                    {turnIndex + 1}
                  </div>
                  {turn.parentTurnId &&
                    turn.parentTurnId !== thread[turnIndex - 1]?.id && (
                      <p className="mb-2 flex items-center gap-1.5 text-[10px] text-[#748097]">
                        <GitBranch aria-hidden="true" className="size-3" />
                        Branched from an earlier answer
                      </p>
                    )}
                  <div className="rounded-[8px] bg-[#eef2fb] px-4 py-3 text-[13px] font-medium leading-5 text-[#2f456f]">
                    {turn.question}
                  </div>

                  {turn.status === "running" && (
                    <div
                      className="mt-3 flex items-center gap-2 rounded-[8px] border border-[#e0e4ea] bg-white px-4 py-4 text-[12px] text-[#667287]"
                      aria-live="polite"
                    >
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin text-[#4563b3]"
                      />
                      Understanding → calculating locally → building the chart
                    </div>
                  )}

                  {isCurrentAmbiguity && ambiguity && (
                    <div className="mt-3 rounded-[9px] border border-[#e4cfae] bg-[#fffaf2] p-4">
                      <Badge variant="warning">Material ambiguity</Badge>
                      <h3 className="mt-3 text-[14px] font-semibold text-[#4c402f]">
                        {ambiguity.question}
                      </h3>
                      <p className="mt-1 text-[11px] leading-5 text-[#745f42]">
                        {ambiguity.whyItMatters}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ambiguity.options.map((option) => (
                          <Button
                            key={option.id}
                            size="sm"
                            variant="secondary"
                            onClick={() => onResolveAmbiguity(option.id)}
                          >
                            {option.label}
                            <ChevronRight aria-hidden="true" className="size-3.5" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {showDefinitionChange && turn.definitionAmbiguity && (
                    <div className="mt-3 rounded-[9px] border border-[#e4cfae] bg-[#fffaf2] p-4">
                      <Badge variant="warning">Change definition</Badge>
                      <h3 className="mt-3 text-[14px] font-semibold text-[#4c402f]">
                        {turn.definitionAmbiguity.question}
                      </h3>
                      <p className="mt-1 text-[11px] leading-5 text-[#745f42]">
                        {turn.definitionAmbiguity.whyItMatters}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {turn.definitionAmbiguity.options.map((option) => (
                          <Button
                            key={option.id}
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setChangingTurnId(undefined);
                              onResolveAmbiguity(option.id);
                            }}
                          >
                            {option.label}
                            <ChevronRight aria-hidden="true" className="size-3.5" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {turnInsights.map((insight) => (
                    <div
                      key={insight.id}
                      className={cn(
                        "mt-3 rounded-[9px] border bg-white",
                        insight.validated
                          ? "border-[#dfe3e9]"
                          : "border-[#ead9bc]",
                      )}
                      data-testid="thread-answer"
                    >
                      <div className="flex flex-col gap-3 border-b border-[#edf0f3] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={insight.validated ? "success" : "warning"}>
                              {insight.validated ? "Calculated" : "Data gap"}
                            </Badge>
                            <span className="text-[10px] text-[#818b9b]">
                              {insight.confidence} confidence
                            </span>
                          </div>
                          <h3 className="mt-3 text-[20px] font-semibold leading-7 tracking-[-0.02em] text-[#1f2d45]">
                            {insight.headline}
                          </h3>
                          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#536076]">
                            {insight.finding}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={
                            insight.selectedForExecutiveStory
                              ? "secondary"
                              : "ghost"
                          }
                          disabled={!insight.validated}
                          onClick={() => onToggleStory(insight.id)}
                        >
                          {insight.selectedForExecutiveStory && (
                            <Check aria-hidden="true" className="size-3.5" />
                          )}
                          {insight.selectedForExecutiveStory
                            ? "In Story"
                            : "Add to Story"}
                        </Button>
                      </div>
                      {insight.chartSpec && (
                        <div className="px-4 py-4 sm:px-5">
                          <InsightChart spec={insight.chartSpec} />
                        </div>
                      )}
                      <div className="border-t border-[#edf0f3] px-5 py-4">
                        <p className="text-[9px] font-bold uppercase tracking-[0.09em] text-[#8a93a2]">
                          Evidence
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {insight.evidence.map((evidence) => (
                            <div
                              key={evidence.id}
                              className="rounded-[6px] bg-[#f7f8fa] px-3 py-2"
                            >
                              <p className="text-[10px] text-[#788294]">
                                {evidence.label}
                              </p>
                              <p className="mt-0.5 text-[12px] font-semibold text-[#354259]">
                                {evidence.value}
                              </p>
                            </div>
                          ))}
                        </div>
                        {insight.suggestedFollowUps.some(
                          (followUp) => followUp.available,
                        ) && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {insight.suggestedFollowUps
                              .filter((followUp) => followUp.available)
                              .map((followUp) => (
                                <button
                                  type="button"
                                  key={followUp.key}
                                  onClick={() =>
                                    onAskQuestion(followUp.label, turn.id)
                                  }
                                  className="rounded-full border border-[#d7deec] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#52689e] transition-colors hover:bg-[#f2f5fb]"
                                >
                                  {followUp.label}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {turn.status !== "running" && !isCurrentAmbiguity && (
                    <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 text-[10px] leading-4 text-[#8a93a2]">
                        <p data-testid="answer-method">
                          Method: {turn.methodNote ?? "Local deterministic calculation"}
                          {turn.provisional ? " · Provisional" : ""}{" "}
                          <button
                            type="button"
                            className="font-semibold text-[#607092] hover:text-[#334158]"
                            onClick={() =>
                              setChangingTurnId((current) =>
                                current === turn.id ? undefined : turn.id,
                              )
                            }
                          >
                            Change
                          </button>
                        </p>
                        {showMethodDetails && (
                          <div className="mt-2 max-w-xl rounded-[7px] border border-[#e4e7ec] bg-[#f8f9fb] px-3 py-2.5 leading-5 text-[#68758a]">
                            {turn.intent?.assumptions.map((assumption) => (
                              <p key={assumption}>• {assumption}</p>
                            ))}
                            {plan?.questionId === turn.id && (
                              <p>• {plan.steps.length} reproducible query step(s).</p>
                            )}
                          </div>
                        )}
                      </div>
                      {turn.status === "complete" && (
                        <button
                          type="button"
                          onClick={() => {
                            setBranchParentId(turn.id);
                            questionRef.current?.focus();
                            window.scrollTo({ top: 160, behavior: "smooth" });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[10px] font-semibold text-[#607092] hover:bg-[#eef2fb]"
                        >
                          <GitBranch aria-hidden="true" className="size-3" />
                          Branch from here
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {active && (
        <details className="mt-8 rounded-[9px] border border-[#dfe3e9] bg-white">
          <summary className="cursor-pointer select-none px-5 py-4 text-[12px] font-semibold text-[#3b485d]">
            Review data meaning and privacy · {active.metadata.name}
          </summary>
          <div className="border-t border-[#edf0f3] px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {datasets.map(({ metadata }) => (
                <button
                  type="button"
                  key={metadata.id}
                  onClick={() => onSelectDataset(metadata.id)}
                  className={cn(
                    "rounded-[6px] border px-3 py-2 text-left text-[10px]",
                    active.metadata.id === metadata.id
                      ? "border-[#9cafde] bg-[#f3f6fd]"
                      : "border-[#e1e5eb]",
                  )}
                >
                  <span className="block max-w-[220px] truncate font-semibold text-[#435069]">
                    {metadata.name}
                  </span>
                  <span className="mt-0.5 block text-[#7b8494]">
                    {formatNumber(metadata.rowCount)} rows
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left">
                <thead className="border-y border-[#e8ebef] bg-[#f8f9fb] text-[9px] font-bold uppercase tracking-[0.07em] text-[#7f8898]">
                  <tr>
                    <th className="px-3 py-2.5">Column</th>
                    <th className="px-3 py-2.5">Source field</th>
                    <th className="px-3 py-2.5">Meaning</th>
                    <th className="px-3 py-2.5">Role</th>
                    <th className="px-3 py-2.5">Privacy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f3] text-[10px] text-[#465267]">
                  {[...active.metadata.columns]
                    .sort(
                      (left, right) =>
                        (left.sourceIndex ?? Number.MAX_SAFE_INTEGER) -
                        (right.sourceIndex ?? Number.MAX_SAFE_INTEGER),
                    )
                    .slice(0, 24)
                    .map((column) => (
                      <tr key={column.sourceName}>
                        <td className="px-3 py-2 font-semibold">
                          {excelColumn(column.sourceIndex) || "—"}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {column.sourceName}
                        </td>
                        <td className="px-3 py-2">
                          {column.semanticMeaning ?? "Inferred from values"}
                        </td>
                        <td className="px-3 py-2">
                          {column.semanticRole?.replaceAll("_", " ") ?? "category"}
                        </td>
                        <td className="px-3 py-2">
                          {column.likelyPII
                            ? "Local-only PII"
                            : column.sensitive
                              ? "Aggregate only"
                              : "Analysis safe"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-[#7a8494]">
              {capabilities.filter((capability) => capability.runnable).length} of{" "}
              {capabilities.length} governed domain paths are currently runnable.
              Simple questions may also run from explicit fields without requiring a
              full domain contract.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
