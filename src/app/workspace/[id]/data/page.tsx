"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  datasetProfiles as demoDatasetProfiles,
  fieldMappings as demoFieldMappings,
  readinessScore as demoReadinessScore,
  readinessScores as demoReadinessScores,
} from "@/lib/demo-data";
import { formatNumber } from "@/lib/utils";
import { useDemo } from "@/components/demo-provider";
import { Button, PageHeader, ProgressBar, StatusBadge } from "@/components/ui";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DataPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id ?? "demo";
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    datasets,
    readiness,
    processedAt,
    processingFiles,
    dataError,
    processFiles,
    clearLocalData,
    mappingConfirmed,
    confirmMapping,
  } = useDemo();

  const usingLocalData = datasets.length > 0;
  const inventory = usingLocalData
    ? datasets.map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
        entity: dataset.entity,
        grain: dataset.grain,
        rows: dataset.rowCount,
        timeRange: dataset.timeRange,
        health: dataset.health,
        mappingStatus: dataset.mappingStatus,
      }))
    : demoDatasetProfiles;
  const readinessScores = readiness?.scores ?? demoReadinessScores;
  const readinessScore = readiness?.overall ?? demoReadinessScore;
  const mappings = usingLocalData
    ? datasets.flatMap((dataset) => dataset.mappings).slice(0, 10)
    : demoFieldMappings;
  const issues = useMemo(
    () =>
      datasets
        .flatMap((dataset) =>
          dataset.issues.map((issue) => ({ ...issue, dataset: dataset.name })),
        )
        .sort((a, b) => {
          const rank = { High: 0, Medium: 1, Low: 2 };
          return rank[a.severity] - rank[b.severity];
        }),
    [datasets],
  );
  const totalRows = datasets.reduce((total, dataset) => total + dataset.rowCount, 0);

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    await processFiles(files);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Data"
        title="Add and inspect your People data"
        description="CSV and Excel files are parsed in this browser. Raw employee and candidate rows are never uploaded to the application server."
        action={
          mappingConfirmed ? (
            <Link
              href={`/workspace/${workspaceId}/analysis`}
              className="inline-flex min-h-10 items-center justify-center rounded-[6px] bg-[#3157c9] px-4 text-[13px] font-semibold text-white"
              data-testid="continue-analysis"
            >
              Continue to Analysis
            </Link>
          ) : (
            <Button
              onClick={confirmMapping}
              disabled={processingFiles}
              data-testid="confirm-mapping"
            >
              {usingLocalData ? "Confirm inferred mappings" : "Use synthetic demo mapping"}
            </Button>
          )
        }
      />

      <section className="surface overflow-hidden">
        <div
          className="m-4 flex min-h-[210px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[#bfc9dc] bg-[#fafbfe] px-6 py-8 text-center transition-colors hover:border-[#879bd0] hover:bg-[#f7f9fe]"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void onFiles(Array.from(event.dataTransfer.files));
          }}
        >
          {processingFiles ? (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="size-7 animate-spin text-[#4261bb]"
              />
              <h2 className="mt-4 text-[15px] font-semibold text-[#24324b]">
                Profiling files locally
              </h2>
              <p className="mt-2 text-[12px] text-[#687488]">
                Inferring table grain, fields, dates, quality, and answerability…
              </p>
            </>
          ) : (
            <>
              <div className="grid size-11 place-items-center rounded-[8px] border border-[#dce3f2] bg-white text-[#4664b8]">
                <UploadCloud aria-hidden="true" className="size-5" />
              </div>
              <h2 className="mt-4 text-[15px] font-semibold text-[#24324b]">
                Drop CSV or Excel files here
              </h2>
              <p className="mt-2 max-w-lg text-[12px] leading-5 text-[#687488]">
                Candidate applications, employee snapshots, hire extracts, and
                rosters can be added together. Files up to 400 MB are decoded in
                this browser; large snapshots are counted in full and inspected
                from a 6,000-row sample. UTF-8, UTF-16, and UTF-32 exports are
                supported.
              </p>
              <input
                ref={inputRef}
                id="people-files"
                type="file"
                multiple
                accept=".csv,.xlsx,text/csv"
                className="sr-only"
                data-testid="people-file-input"
                onChange={(event) => void onFiles(Array.from(event.target.files ?? []))}
              />
              <label
                htmlFor="people-files"
                className="mt-5 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-[6px] bg-[#3157c9] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2848aa]"
              >
                Browse files
              </label>
            </>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-[#e8ebf0] bg-[#fbfcfd] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[11px] text-[#59677b]">
            <ShieldCheck aria-hidden="true" className="size-4 text-[#3f7d61]" />
            <span>
              <strong className="font-semibold text-[#344158]">Local-first:</strong>{" "}
              raw employee rows stay in this browser. Email and name columns are
              redacted in the in-memory sample; only aggregate profiles may later
              be sent to AI services.
            </span>
          </div>
          {usingLocalData && (
            <button
              type="button"
              onClick={clearLocalData}
              className="inline-flex min-h-9 items-center gap-2 rounded-[6px] px-3 text-[11px] font-semibold text-[#697487] hover:bg-[#eef1f5] hover:text-[#39475d]"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Clear local files
            </button>
          )}
        </div>
      </section>

      {dataError && (
        <div
          className="flex gap-3 rounded-[8px] border border-[#efd3cf] bg-[#fff8f7] p-4"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-[#a95047]"
          />
          <div>
            <p className="text-[12px] font-semibold text-[#823f39]">
              The files could not complete the workflow
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[#76524e]">{dataError}</p>
          </div>
        </div>
      )}

      {usingLocalData && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#d7e8df] bg-[#f4faf6] px-4 py-3"
          data-testid="uploaded-data-summary"
        >
          <span className="flex items-center gap-2 text-[12px] font-semibold text-[#315f4b]">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {datasets.length} files · {formatNumber(totalRows)} rows processed locally
          </span>
          <span className="text-[11px] text-[#658071]">
            {processedAt
              ? `Profiled ${new Date(processedAt).toLocaleTimeString()}`
              : "Profile ready"}
          </span>
        </div>
      )}

      <section className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <div className="surface p-6">
          <p className="eyebrow">Measurement readiness</p>
          <p className="metric-number mt-4">{readinessScore}</p>
          <p className="mt-1 text-[12px] text-[#667385]">out of 100</p>
          <p className="mt-4 text-[12px] leading-5 text-[#5d6a7d]">
            {readiness
              ? `${readiness.answerability}% answerability for the approved strategy question.`
              : "Preloaded synthetic readiness until you add local files."}
          </p>
        </div>
        <div className="surface p-6">
          <p className="eyebrow">Readiness components</p>
          <div className="mt-5 space-y-4">
            {Object.entries(readinessScores).map(([label, value]) => (
              <div key={label}>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="font-medium text-[#344158]">{label}</span>
                  <span className="tabular-nums text-[#667385]">{value}</span>
                </div>
                <ProgressBar value={value} tone={value < 70 ? "warning" : "brand"} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#edf0f4] px-6 py-4">
          <p className="eyebrow">Dataset inventory</p>
          {usingLocalData && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3f7d61]">
              Live local profile
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="bg-[#f8f9fb] text-[11px] uppercase tracking-[0.06em] text-[#738094]">
              <tr>
                {[
                  "Dataset",
                  "Inferred type",
                  "Grain",
                  "Rows",
                  "Time range",
                  "Health",
                  "Mapping",
                ].map((heading) => (
                  <th key={heading} className="px-5 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inventory.map((dataset) => {
                const live = datasets.find((item) => item.id === dataset.id);
                return (
                <tr key={dataset.id} className="border-t border-[#eef1f4]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet
                        aria-hidden="true"
                        className="size-4 shrink-0 text-[#6478b7]"
                      />
                      <span className="font-medium text-[#24324b]">{dataset.name}</span>
                    </div>
                    {usingLocalData && (
                      <span className="ml-6 mt-0.5 block text-[10px] text-[#8992a1]">
                        {formatBytes(live?.size ?? 0)}
                        {live?.aggregates?.encoding
                          ? ` · ${live.aggregates.encoding}`
                          : ""}
                        {live?.aggregates?.sampled ? " · sampled" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[#4d5b70]">{dataset.entity}</td>
                  <td className="px-5 py-3 text-[#4d5b70]">{dataset.grain}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-[#4d5b70]">
                    {formatNumber(dataset.rows)}
                  </td>
                  <td className="px-5 py-3 text-[#4d5b70]">{dataset.timeRange}</td>
                  <td className="px-5 py-3 tabular-nums text-[#4d5b70]">
                    {dataset.health}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={dataset.mappingStatus} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="surface p-6">
          <p className="eyebrow">Inferred column mapping</p>
          <div className="mt-4 space-y-3">
            {mappings.map((mapping, index) => (
              <div
                key={`${mapping.id}-${index}`}
                className="flex items-center justify-between gap-4 border-b border-[#eef1f4] pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[#24324b]">
                    {mapping.sourceField}
                  </p>
                  <p className="truncate text-[12px] text-[#667385]">
                    {mapping.proposedMeaning} → {mapping.canonicalField}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] tabular-nums text-[#667385]">
                    {mapping.confidence}%
                  </p>
                  <StatusBadge status={mapping.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface p-6">
          <p className="eyebrow">Evidence gaps and quality issues</p>
          {usingLocalData && issues.length > 0 ? (
            <div className="mt-4 space-y-4">
              {issues.slice(0, 4).map((issue) => (
                <article key={`${issue.dataset}-${issue.id}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a5c17]">
                      {issue.severity}
                    </span>
                    <span className="text-[10px] text-[#8992a1]">{issue.dataset}</span>
                  </div>
                  <h2 className="mt-1 text-[13px] font-semibold text-[#24324b]">
                    {issue.title}
                  </h2>
                  <p className="mt-1 text-[12px] leading-5 text-[#5c697d]">
                    {issue.impact}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <h2 className="text-[14px] font-semibold text-[#1c2b44]">
                Candidate → employee linkage is incomplete
              </h2>
              <p className="mt-2 text-[12px] leading-5 text-[#546277]">
                Quality of Hire can be reported, but source attribution is less
                reliable without a persistent crosswalk.
              </p>
            </div>
          )}
        </div>
      </section>

      {readiness && (
        <section className="surface p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="eyebrow text-[#3f7d61]">What we can answer</p>
              <ul className="mt-3 space-y-2 text-[12px] leading-5 text-[#536176]">
                {readiness.canAnswer.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow text-[#9a5c17]">What remains unknown</p>
              <ul className="mt-3 space-y-2 text-[12px] leading-5 text-[#536176]">
                {readiness.cannotAnswer.map((item) => (
                  <li key={item}>— {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
