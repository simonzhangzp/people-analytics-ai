"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import type {
  DatasetRelationship,
  FieldMapping,
  LocalWorkbenchDataset,
} from "@/types/workbench";

interface DataCanvasProps {
  datasets: LocalWorkbenchDataset[];
  mappings: FieldMapping[];
  relationships: DatasetRelationship[];
  activeDatasetId?: string;
  processing: boolean;
  processingMessage?: string;
  error?: string;
  questionText: string;
  questionAsked: boolean;
  onAddFiles: (files: File[]) => Promise<void> | void;
  onSelectDataset: (id: string) => void;
  onQuestionTextChange: (value: string) => void;
  onAskQuestion: () => void;
  onContinue: () => void;
}

export function DataCanvas({
  datasets,
  mappings,
  relationships,
  activeDatasetId,
  processing,
  processingMessage,
  error,
  questionText,
  questionAsked,
  onAddFiles,
  onSelectDataset,
  onQuestionTextChange,
  onAskQuestion,
  onContinue,
}: DataCanvasProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const active =
    datasets.find(({ metadata }) => metadata.id === activeDatasetId) ?? datasets[0];

  const acceptFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    void onAddFiles(Array.from(list).slice(0, 3));
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 lg:px-10">
      <header className="border-b border-[#dfe3e9] pb-7">
        <p className="eyebrow">Data · Local-first understanding</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="max-w-3xl text-[28px] font-semibold leading-[1.2] tracking-[-0.035em] text-[#14213b] sm:text-[32px]">
              Can these files answer an attrition question credibly?
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#5d697c]">
              Inspect grain, field meaning, relationship coverage, and material gaps
              before agreeing on a metric.
            </p>
          </div>
          {datasets.length > 0 && (
            <Button
              onClick={onContinue}
              disabled={!questionAsked}
              data-testid="continue-to-metrics"
            >
              Review metric definition
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      </header>

      <section className="mt-7" aria-labelledby="local-data-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="local-data-heading" className="text-[15px] font-semibold text-[#24324a]">
              Local People data
            </h2>
            <p className="mt-1 text-[12px] text-[#717b8b]">
              CSV or Excel · up to three related files
            </p>
          </div>
          <Badge variant="success">
            <ShieldCheck aria-hidden="true" className="size-3" />
            Raw data never uploaded
          </Badge>
        </div>

        <div
          className={cn(
            "relative rounded-[9px] border border-dashed px-6 py-8 text-center transition-colors",
            dragging
              ? "border-[#6f87cc] bg-[#f1f4fc]"
              : "border-[#cfd5df] bg-white hover:border-[#aeb9ca]",
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
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".csv,.xlsx,.xls"
            className="sr-only"
            onChange={(event) => {
              acceptFiles(event.target.files);
              event.target.value = "";
            }}
            data-testid="workbench-file-input"
          />
          {processing ? (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="mx-auto size-6 animate-spin text-[#4563b3]"
              />
              <p className="mt-3 text-[13px] font-semibold text-[#344158]">
                {processingMessage ?? "Profiling locally…"}
              </p>
              <p className="mt-1 text-[11px] text-[#808999]">
                Parsing, profiling, and joining happen in your browser.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto grid size-10 place-items-center rounded-[7px] border border-[#dfe5f2] bg-[#f4f6fc] text-[#3a5ab4]">
                <Plus aria-hidden="true" className="size-5" />
              </div>
              <p className="mt-3 text-[13px] font-semibold text-[#344158]">
                Drop related People files here
              </p>
              <p className="mt-1 text-[11px] text-[#808999]">
                Employee snapshots, terminations, and compensation work well together.
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
          )}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-[7px] border border-[#d9e4dd] bg-[#f6faf7] px-4 py-3 text-[11px] leading-5 text-[#4d6959]">
          <LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          The browser holds raw rows only for this session. AI receives schema,
          cardinality, date ranges, approved definitions, and aggregate evidence—never
          employee-level rows or sample values.
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

      {datasets.length > 0 && (
        <>
          <section className="mt-8" aria-labelledby="dataset-inventory-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2
                  id="dataset-inventory-heading"
                  className="text-[15px] font-semibold text-[#24324a]"
                >
                  Dataset inventory
                </h2>
                <p className="mt-1 text-[12px] text-[#717b8b]">
                  Evidence about each file—not a generic data preview.
                </p>
              </div>
              <Badge variant={datasets.every(({ metadata }) => metadata.healthScore >= 70) ? "success" : "warning"}>
                {datasets.every(({ metadata }) => metadata.healthScore >= 70)
                  ? "Ready for definition"
                  : "Review needed"}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {datasets.map(({ metadata }) => (
                <button
                  type="button"
                  key={metadata.id}
                  onClick={() => onSelectDataset(metadata.id)}
                  aria-pressed={active?.metadata.id === metadata.id}
                  className={cn(
                    "rounded-[8px] border bg-white p-4 text-left transition-colors",
                    active?.metadata.id === metadata.id
                      ? "border-[#9cafde] ring-2 ring-[#dce4f8]"
                      : "border-[#dfe3e9] hover:border-[#bfc7d3]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <FileSpreadsheet
                      aria-hidden="true"
                      className="size-4.5 text-[#4563b3]"
                    />
                    <Badge
                      variant={metadata.healthScore >= 80 ? "success" : "warning"}
                    >
                      {metadata.healthScore}/100
                    </Badge>
                  </div>
                  <p className="mt-4 truncate text-[13px] font-semibold text-[#26344d]">
                    {metadata.name}
                  </p>
                  <p className="mt-1 text-[11px] text-[#788294]">
                    {metadata.inferredType}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#edf0f3] pt-3">
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#939aa7]">
                        Rows
                      </dt>
                      <dd className="mt-1 text-[12px] font-semibold tabular-nums text-[#3b485d]">
                        {formatNumber(metadata.rowCount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#939aa7]">
                        Grain
                      </dt>
                      <dd className="mt-1 truncate text-[12px] font-semibold text-[#3b485d]">
                        {metadata.grain.label}
                      </dd>
                    </div>
                  </dl>
                </button>
              ))}
            </div>
          </section>

          {active && (
            <section
              className="mt-6 rounded-[9px] border border-[#dfe3e9] bg-white"
              aria-labelledby="dataset-evidence-heading"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e6e9ee] px-5 py-4">
                <div>
                  <h2
                    id="dataset-evidence-heading"
                    className="text-[14px] font-semibold text-[#26344d]"
                  >
                    {active.metadata.name}: inferred meaning
                  </h2>
                  <p className="mt-1 text-[11px] text-[#788294]">
                    {active.metadata.grain.evidence.join(" · ")}
                  </p>
                </div>
                <Badge
                  variant={
                    active.metadata.status === "Approved" ? "success" : "warning"
                  }
                >
                  {active.metadata.status}
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left">
                  <thead className="border-b border-[#e8ebef] bg-[#f8f9fb]">
                    <tr className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#7f8898]">
                      <th className="px-5 py-3">Source field</th>
                      <th className="px-4 py-3">Meaning</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Missing</th>
                      <th className="px-5 py-3">Evidence state</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf0f3]">
                    {active.metadata.columns.slice(0, 12).map((column) => {
                      const mapping = mappings.find(
                        (item) =>
                          item.datasetId === active.metadata.id &&
                          item.sourceColumn === column.sourceName,
                      );
                      return (
                        <tr key={column.sourceName} className="text-[12px] text-[#465267]">
                          <td className="px-5 py-3 font-mono text-[11px] text-[#2e3c54]">
                            {column.sourceName}
                          </td>
                          <td className="px-4 py-3">
                            {mapping?.semanticMeaning ??
                              column.semanticMeaning ??
                              "Unmapped field"}
                          </td>
                          <td className="px-4 py-3">{column.inferredType}</td>
                          <td className="px-4 py-3 tabular-nums">
                            {(column.nullPct * 100).toFixed(0)}%
                          </td>
                          <td className="px-5 py-3">
                            <Badge
                              variant={
                                mapping?.status === "Approved"
                                  ? "success"
                                  : column.likelyPII
                                    ? "warning"
                                    : "info"
                              }
                            >
                              {column.likelyPII
                                ? "Local-only PII"
                                : mapping?.status ?? "Proposed"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mt-6" aria-labelledby="relationship-heading">
            <h2
              id="relationship-heading"
              className="text-[15px] font-semibold text-[#24324a]"
            >
              Relationship evidence
            </h2>
            <p className="mt-1 text-[12px] text-[#717b8b]">
              Join coverage determines which questions are answerable.
            </p>
            <div className="mt-4 space-y-3">
              {relationships.length === 0 ? (
                <div className="rounded-[8px] border border-[#e1e5eb] bg-white p-5">
                  <Database aria-hidden="true" className="size-4 text-[#748199]" />
                  <p className="mt-2 text-[12px] font-semibold text-[#46536a]">
                    Add another related file to validate joins.
                  </p>
                </div>
              ) : (
                relationships.map((relationship) => {
                  const from = datasets.find(
                    ({ metadata }) => metadata.id === relationship.fromDatasetId,
                  )?.metadata.name;
                  const to = datasets.find(
                    ({ metadata }) => metadata.id === relationship.toDatasetId,
                  )?.metadata.name;
                  return (
                    <article
                      key={relationship.id}
                      className="rounded-[8px] border border-[#dfe3e9] bg-white p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <Link2 aria-hidden="true" className="size-4 shrink-0 text-[#4966b3]" />
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-[#344158]">
                              {from} <span className="text-[#8b94a3]">→</span> {to}
                            </p>
                            <p className="mt-1 text-[11px] text-[#778192]">
                              {relationship.fromField} ↔ {relationship.toField} ·{" "}
                              {relationship.cardinality}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              relationship.matchRate >= 0.9 ? "success" : "warning"
                            }
                          >
                            {(relationship.matchRate * 100).toFixed(0)}% coverage
                          </Badge>
                          {relationship.conflicts.length === 0 && (
                            <CheckCircle2
                              aria-label="No material join conflict"
                              className="size-4 text-[#3f7d61]"
                            />
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section
            className="mt-6 rounded-[9px] border border-[#d7dfef] bg-white p-5"
            aria-labelledby="people-question-heading"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2
                    id="people-question-heading"
                    className="text-[15px] font-semibold text-[#24324a]"
                  >
                    Ask a People Analytics question
                  </h2>
                  {questionAsked && (
                    <Badge variant="success">
                      <CheckCircle2 aria-hidden="true" className="size-3" />
                      Question scoped
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-[#717b8b]">
                  Use a business question. The workbench will propose the metric before
                  calculating.
                </p>
                <label htmlFor="workbench-question" className="sr-only">
                  People Analytics question
                </label>
                <textarea
                  id="workbench-question"
                  value={questionText}
                  onChange={(event) => onQuestionTextChange(event.target.value)}
                  rows={2}
                  placeholder="Why has Engineering voluntary attrition increased?"
                  className="mt-3 w-full resize-none rounded-[7px] border border-[#cbd3df] px-4 py-3 text-[13px] leading-5 text-[#2f3d55] outline-none focus:border-[#8196d1] focus:ring-2 focus:ring-[#3157d5]/10"
                  data-testid="workbench-question"
                />
              </div>
              <Button
                className="shrink-0"
                disabled={!questionText.trim() || processing}
                onClick={onAskQuestion}
                data-testid="ask-workbench-question"
              >
                {questionAsked ? "Update metric proposal" : "Propose metric definition"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

