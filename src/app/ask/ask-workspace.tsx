"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  HelpCircle,
  LoaderCircle,
  Menu,
  MessageSquareText,
  PanelRight,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  Users,
  Workflow,
  X,
} from "lucide-react";
import {
  analyzeAskFile,
  buildAskInsights,
  defaultAskConfirmations,
} from "@/lib/analytics/ask-file";
import { parseAndProfileFile } from "@/lib/data/local-profiler";
import { suggestAskQuestion } from "@/lib/data/report-headers";
import { BrandMark, Button, PageHeader, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { AskConfirmations, AskEvidenceKind, AskFileResult, AskInsight } from "@/types/ask";
import type { LocalDataset } from "@/types/local-data";

const progressSteps = [
  { label: "Reading the file locally", value: 16 },
  { label: "Profiling structure and quality", value: 38 },
  { label: "Matching columns to the question", value: 58 },
  { label: "Calculating what can be answered", value: 82 },
  { label: "Drafting the conclusion", value: 100 },
];

const insightIcons = {
  alert: AlertTriangle,
  check: CheckCircle2,
  users: Users,
  target: Target,
  clock: Clock3,
  shield: ShieldCheck,
};

function EvidenceBadge({ kind }: { kind: AskEvidenceKind }) {
  const label =
    kind === "proposal"
      ? "Proposal"
      : kind === "assumption"
        ? "Assumption"
        : kind === "approved"
          ? "Approved"
          : "Missing evidence";
  const style =
    kind === "approved"
      ? "bg-[#eaf5ef] text-[#2f7659] border-[#d2e8dc]"
      : kind === "assumption"
        ? "bg-[#fbf2e5] text-[#9a5c17] border-[#f1dfc4]"
        : kind === "missing"
          ? "bg-[#fbeeee] text-[#9a4545] border-[#efd4d4]"
          : "bg-[#edf2ff] text-[#3657af] border-[#dae3fb]";
  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold", style)}>
      {label}
    </span>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function AskWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(progressSteps[0]);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<LocalDataset | null>(null);
  const [result, setResult] = useState<AskFileResult | null>(null);
  const [confirmations, setConfirmations] = useState<AskConfirmations>({});
  const [draftConfirmations, setDraftConfirmations] = useState<AskConfirmations>(
    defaultAskConfirmations,
  );
  const [insights, setInsights] = useState<AskInsight[] | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const suggested = useMemo(
    () => (file ? suggestAskQuestion(file.name) : suggestAskQuestion("")),
    [file],
  );

  const onFile = (next: File | null) => {
    setFile(next);
    setError(null);
    setDataset(null);
    setResult(null);
    setInsights(null);
    setConfirmations({});
    setDraftConfirmations(defaultAskConfirmations);
    if (next && !question.trim()) {
      setQuestion(suggestAskQuestion(next.name));
    }
  };

  const runAsk = async (
    sourceFile: File,
    asked: string,
    nextConfirmations: AskConfirmations,
    existingDataset?: LocalDataset,
  ) => {
    setRunning(true);
    setError(null);
    setInsights(null);
    try {
      setProgress(progressSteps[0]);
      await sleep(80);
      const profiled = existingDataset ?? (await parseAndProfileFile(sourceFile));
      setDataset(profiled);
      setProgress(progressSteps[1]);
      await sleep(80);
      setProgress(progressSteps[2]);
      await sleep(80);
      const analyzed = analyzeAskFile(profiled, asked, nextConfirmations);
      setProgress(progressSteps[3]);
      await sleep(80);
      setResult(analyzed);
      setConfirmations(nextConfirmations);
      setDraftConfirmations({ ...defaultAskConfirmations, ...nextConfirmations });
      setProgress(progressSteps[4]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be analyzed locally.");
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const onAnalyze = async () => {
    if (!file) {
      setError("Add a CSV or Excel file first.");
      return;
    }
    await runAsk(file, question.trim() || suggested, confirmations);
  };

  const onApplyDefinitions = async () => {
    if (!file || !dataset) return;
    await runAsk(file, question.trim() || suggested, draftConfirmations, dataset);
  };

  const designer = (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#e4e7ec] px-5">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#1e2a43]">
            <Sparkles aria-hidden="true" className="size-4 text-[#4564bb]" />
            AI Co-Designer
          </div>
          <p className="mt-0.5 text-[11px] text-[#7a8495]">Code calculates. You confirm meaning.</p>
        </div>
        <button
          type="button"
          onClick={() => setAiOpen(false)}
          aria-label="Close AI Co-Designer"
          className="grid size-9 place-items-center rounded-[6px] text-[#667085] hover:bg-[#f1f3f6] xl:hidden"
        >
          <X aria-hidden="true" className="size-4.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <p className="eyebrow">Evidence kinds</p>
        <div className="mt-3 space-y-2 text-[12px] leading-5 text-[#5c687b]">
          <p>Proposals are suggested meanings. Assumptions are used only until you confirm them. Approved definitions change the numbers. Missing evidence is not invented.</p>
        </div>
        {result ? (
          <div className="mt-6 space-y-4">
            {result.pendingDefinitions.map((definition) => (
              <div key={definition.id} className="rounded-[8px] border border-[#e4e7ec] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] font-semibold text-[#25334c]">{definition.label}</p>
                  <EvidenceBadge kind={definition.kind} />
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[#6a7485]">{definition.why}</p>
                <div className="mt-3 space-y-2">
                  {definition.options.map((option) => (
                    <label key={option.id} className="flex items-start gap-2 text-[12px] text-[#334057]">
                      <input
                        type="radio"
                        name={definition.id}
                        value={option.id}
                        checked={(draftConfirmations[definition.id] ?? definition.options[0]?.id) === option.id}
                        onChange={() =>
                          setDraftConfirmations((current) => ({
                            ...current,
                            [definition.id]: option.id,
                          }))
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {result.pendingDefinitions.length > 0 && (
              <Button
                onClick={() => void onApplyDefinitions()}
                disabled={running}
                data-testid="apply-definitions"
              >
                Confirm definitions and re-answer
              </Button>
            )}
            {result.missingEvidence.length > 0 && (
              <div className="rounded-[8px] border border-[#efd4d4] bg-[#fdf7f7] p-3">
                <EvidenceBadge kind="missing" />
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-[#6d4a4a]">
                  {result.missingEvidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-6 text-[13px] leading-5 text-[#5c687b]">
            After you confirm a file and question, unclear definitions appear here before they change the answer.
          </p>
        )}
      </div>
    </aside>
  );

  const rail = (
    <nav aria-label="Application scenarios" className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <p className="eyebrow">Scenarios</p>
        <p className="mt-2 text-[12px] leading-5 text-[#768093]">
          Start with a practical question, not the full loop
        </p>
      </div>
      <div className="space-y-1 px-3">
        <Link
          href="/ask"
          aria-current="page"
          data-testid="nav-ask"
          className="flex min-h-14 items-center gap-3 rounded-[7px] border border-[#dbe3f8] bg-[#eef2fb] px-3 text-[#23449f]"
        >
          <MessageSquareText aria-hidden="true" className="size-4.5 text-[#3458bd]" />
          <span>
            <span className="block text-[12px] font-semibold">Ask a People file</span>
            <span className="mt-1 block text-[10px] text-[#8a93a2]">Analysis</span>
          </span>
        </Link>
        <Link
          href="/demo"
          className="flex min-h-14 items-center gap-3 rounded-[7px] border border-transparent px-3 text-[#4e5b70] hover:bg-[#f3f5f8]"
        >
          <Workflow aria-hidden="true" className="size-4.5 text-[#7b8596]" />
          <span>
            <span className="block text-[12px] font-semibold">Full strategy loop</span>
            <span className="mt-1 block text-[10px] text-[#8a93a2]">Strategy</span>
          </span>
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-[#dfe3e9] bg-white/95 px-4 backdrop-blur sm:px-6">
        <button
          type="button"
          aria-label="Open scenarios"
          onClick={() => setNavOpen(true)}
          className="mr-3 grid size-10 place-items-center rounded-[6px] text-[#506077] hover:bg-[#f2f4f7] lg:hidden"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <Link href="/" aria-label="People Strategy Intelligence home">
          <BrandMark />
        </Link>
        <div className="ml-6 hidden min-w-0 sm:block">
          <p className="truncate text-[12px] font-semibold text-[#344159]">Ask a People file</p>
          <p className="mt-0.5 text-[10px] text-[#8992a1]">Local analysis · confirm meaning before action</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="Open AI Co-Designer"
            onClick={() => setAiOpen(true)}
            className="grid size-10 place-items-center rounded-[6px] border border-[#dce1e8] text-[#455675] hover:bg-[#f5f7fa] xl:hidden"
          >
            <PanelRight aria-hidden="true" className="size-4.5" />
          </button>
          <Link
            href="/architecture"
            aria-label="Help and architecture"
            className="hidden size-10 place-items-center rounded-[6px] text-[#667287] hover:bg-[#f2f4f7] sm:grid"
          >
            <HelpCircle aria-hidden="true" className="size-4.5" />
          </Link>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)] xl:grid-cols-[224px_minmax(0,1fr)_340px]">
        <aside className="hidden border-r border-[#dfe3e9] bg-white lg:block">
          <div className="sticky top-16 h-[calc(100vh-64px)]">{rail}</div>
        </aside>

        <main className="min-w-0">
          <div className="mx-auto w-full max-w-[1120px] px-5 py-7 sm:px-8 sm:py-9">
            <PageHeader
              eyebrow="Analysis"
              title="Ask a question of one People file"
              description="Add a file and the decision you need. The model does not invent counts. Local code profiles the file, then you confirm any unclear definition."
            />

            <section className="mt-8 surface p-5 sm:p-6">
              <div className="flex items-start gap-3 rounded-[8px] border border-[#d8e1dc] bg-[#f6faf7] px-4 py-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 text-[#3f7d61]" />
                <p className="text-[12px] leading-5 text-[#355744]">
                  Raw People rows stay in this browser. The file is not uploaded to the application server for analysis.
                </p>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <label className="text-[12px] font-semibold text-[#334057]" htmlFor="ask-file">
                    Data file
                  </label>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-2 flex min-h-[132px] w-full flex-col items-center justify-center rounded-[8px] border border-dashed border-[#bfc9dc] bg-[#fafbfe] px-4 text-center hover:border-[#879bd0]"
                  >
                    <UploadCloud aria-hidden="true" className="size-5 text-[#4664b8]" />
                    <span className="mt-2 text-[13px] font-semibold text-[#24324b]">
                      {file ? file.name : "Drop or choose CSV / Excel"}
                    </span>
                    <span className="mt-1 text-[11px] text-[#687488]">
                      Talent review, appraisal, roster, or recruiting extracts
                    </span>
                  </button>
                  <input
                    ref={inputRef}
                    id="ask-file"
                    type="file"
                    accept=".csv,.xlsx,text/csv"
                    className="sr-only"
                    data-testid="ask-file-input"
                    onChange={(event) => onFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-[#334057]" htmlFor="ask-question">
                    What do you want to know?
                  </label>
                  <textarea
                    id="ask-question"
                    data-testid="ask-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder={suggested}
                    rows={6}
                    className="mt-2 w-full rounded-[8px] border border-[#d6dce5] bg-white px-3 py-2 text-[13px] text-[#24324b] outline-none focus:border-[#879bd0]"
                  />
                  <p className="mt-2 text-[11px] text-[#7a8495]">
                    Similar talent-review files are auto-detected and this question is prefilled.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button onClick={() => void onAnalyze()} disabled={running} data-testid="ask-analyze">
                  {running ? "Analyzing locally" : "Confirm and analyze"}
                </Button>
                {file && (
                  <span className="inline-flex items-center gap-2 text-[12px] text-[#5c687b]">
                    <FileSpreadsheet aria-hidden="true" className="size-3.5" />
                    {file.name}
                  </span>
                )}
              </div>
              {error && (
                <p className="mt-3 text-[12px] text-[#9a4545]" role="alert">
                  {error}
                </p>
              )}
            </section>

            {(running || result) && (
              <section className="mt-6 surface p-5 sm:p-6" data-testid="ask-progress">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-[#25334c]">
                    {running ? progress.label : "Local analysis complete"}
                  </p>
                  {running && <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-[#4261bb]" />}
                </div>
                <div className="mt-3">
                  <ProgressBar value={running ? progress.value : 100} tone={running ? "brand" : "success"} />
                </div>
              </section>
            )}

            {result && (
              <div className="mt-6 space-y-6">
                <section className="surface p-5 sm:p-6" data-testid="ask-answer">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="eyebrow">Answer</p>
                    <EvidenceBadge kind={result.answerable ? "approved" : "missing"} />
                  </div>
                  <p className="mt-2 text-[12px] text-[#6a7485]">{result.question}</p>
                  <p
                    className="mt-3 text-[16px] font-semibold leading-6 text-[#17243f]"
                    data-testid="ask-takeaway"
                  >
                    {result.conclusion}
                  </p>
                  {result.assumptions.length > 0 && (
                    <div className="mt-4 rounded-[8px] border border-[#f1dfc4] bg-[#fbf7f0] p-4">
                      <EvidenceBadge kind="assumption" />
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-[#6d5428]">
                        {result.assumptions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.approvedDefinitions.length > 0 && (
                    <div className="mt-3 rounded-[8px] border border-[#d2e8dc] bg-[#f6faf7] p-4">
                      <EvidenceBadge kind="approved" />
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-[#355744]">
                        {result.approvedDefinitions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>

                <section className="surface p-5 sm:p-6" data-testid="ask-file-brief">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow">File</p>
                      <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-[#121d35]">
                        What this file is
                      </h2>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085]">
                        Data quality
                      </p>
                      <p className="metric-number mt-1" data-testid="ask-quality-score">
                        {result.qualityScore}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-[15px] leading-6 text-[#24324b]">{result.fileSummary}</p>
                  <p className="mt-3 text-[13px] leading-6 text-[#5c687b]">{result.structure}</p>
                  <p className="mt-3 text-[12px] leading-5 text-[#6a7485]">{result.qualityCaption}</p>
                </section>

                <section className="surface p-5 sm:p-6" data-testid="ask-evidence">
                  <p className="eyebrow">Evidence</p>
                  <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-[#121d35]">
                    Columns and calculations
                  </h2>
                  <h3 className="mt-6 text-[13px] font-semibold text-[#25334c]">Columns used</h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-[12px]">
                      <thead className="text-[#667085]">
                        <tr className="border-b border-[#e5e8ed]">
                          <th className="py-2 font-semibold">Source column</th>
                          <th className="py-2 font-semibold">Meaning</th>
                          <th className="py-2 font-semibold">Fill</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.columnsUsed.map((column) => (
                          <tr key={column.source} className="border-b border-[#eef1f4]">
                            <td className="py-2 text-[#24324b]">{column.source}</td>
                            <td className="py-2 text-[#5c687b]">{column.meaning}</td>
                            <td className="py-2 text-[#24324b]">{column.fillRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <h3 className="mt-6 text-[13px] font-semibold text-[#25334c]">How related metrics were calculated</h3>
                  <ul className="mt-3 space-y-3">
                    {result.metrics.map((metric) => (
                      <li key={metric.name} className="rounded-[8px] border border-[#e4e7ec] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[13px] font-semibold text-[#25334c]">{metric.name}</p>
                          <EvidenceBadge kind={metric.status === "assumption" ? "assumption" : "approved"} />
                        </div>
                        <p className="mt-2 text-[14px] text-[#17243f]">{metric.value}</p>
                        <p className="mt-1 text-[12px] text-[#6a7485]">{metric.formula}</p>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="surface p-5 sm:p-6" data-testid="ask-insights-panel">
                  <p className="eyebrow">Next</p>
                  <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-[#121d35]">
                    Generate icon insights
                  </h2>
                  <p className="mt-2 text-[13px] leading-6 text-[#5c687b]">
                    Insights reuse the same calculated numbers. They do not add new counts.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => setInsights(buildAskInsights(result))}
                    data-testid="generate-insights"
                  >
                    Generate insights
                  </Button>
                  {insights && (
                    <div className="mt-5 grid gap-3 md:grid-cols-2" data-testid="ask-insights">
                      {insights.map((insight) => {
                        const Icon = insightIcons[insight.icon];
                        return (
                          <article key={insight.id} className="rounded-[8px] border border-[#e4e7ec] p-4">
                            <div className="flex items-start gap-3">
                              <div className="grid size-9 place-items-center rounded-[7px] border border-[#dfe5f2] bg-[#f4f6fc] text-[#3a5ab4]">
                                <Icon aria-hidden="true" className="size-4.5" />
                              </div>
                              <div>
                                <h3 className="text-[13px] font-semibold text-[#25334c]">{insight.title}</h3>
                                <p className="mt-1 text-[12px] leading-5 text-[#334057]">{insight.body}</p>
                                <p className="mt-2 text-[11px] text-[#7a8495]">{insight.evidence}</p>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </main>

        <aside className="hidden border-l border-[#dfe3e9] bg-white xl:block">
          <div className="sticky top-16 h-[calc(100vh-64px)]">{designer}</div>
        </aside>
      </div>

      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close scenarios"
            className="absolute inset-0 bg-[#101828]/30"
            onClick={() => setNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-white">{rail}</aside>
        </div>
      )}
      {aiOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Close AI Co-Designer"
            className="absolute inset-0 bg-[#101828]/30"
            onClick={() => setAiOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-[380px]">{designer}</div>
        </div>
      )}
    </div>
  );
}
