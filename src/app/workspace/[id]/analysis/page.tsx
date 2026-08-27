"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  analysisQuestion,
  buildMetricDashboards,
} from "@/lib/analytics/metric-dashboards";
import { useDemo } from "@/components/demo-provider";
import { Button, ConfidenceBadge, PageHeader } from "@/components/ui";
import type { MetricDashboard } from "@/types/local-data";

function statusLabel(status: MetricDashboard["status"]) {
  if (status === "calculated") return "Calculated";
  if (status === "partial") return "Partial evidence";
  return "Missing evidence";
}

function statusClass(status: MetricDashboard["status"]) {
  if (status === "calculated") return "text-[#3f7d61]";
  if (status === "partial") return "text-[#9a5c17]";
  return "text-[#697386]";
}

function EvidenceChart({
  title,
  unit,
  points,
  height = 180,
}: {
  title: string;
  unit: string;
  points: Array<{ label: string; value: number }>;
  height?: number;
}) {
  if (points.length === 0) return null;
  const categoryWidth = points.some((point) => point.label.length > 12) ? 120 : 88;

  return (
    <div className="mt-4" style={{ height }}>
      <p className="text-[11px] font-medium text-[#7a8496]">{title}</p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={points}
          layout="vertical"
          margin={{ right: 16, left: 4, top: 8, bottom: 0 }}
        >
          <CartesianGrid stroke="#eef1f4" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#728096", fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="label"
            width={categoryWidth}
            tick={{ fill: "#546277", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [
              `${String(value ?? 0)} ${unit}`,
              unit === "days" ? "Median" : "Value",
            ]}
            cursor={{ fill: "#f4f6fa" }}
          />
          <Bar dataKey="value" fill="#4667c8" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DashboardCard({ dashboard }: { dashboard: MetricDashboard }) {
  return (
    <article
      className="surface p-5"
      data-testid={`dashboard-card-${dashboard.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">{dashboard.role}</p>
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${statusClass(dashboard.status)}`}
        >
          {statusLabel(dashboard.status)}
        </span>
      </div>
      <h3 className="mt-3 text-[16px] font-semibold text-[#1c2b44]">{dashboard.name}</h3>
      <p className="metric-number mt-3">{dashboard.value}</p>
      {dashboard.target ? (
        <p className="mt-1 text-[11px] text-[#7a8496]">Target {dashboard.target}</p>
      ) : null}
      <p
        className="mt-3 text-[13px] leading-6 text-[#3d4b61]"
        data-testid="dashboard-sentence"
      >
        {dashboard.sentence}
      </p>
      <EvidenceChart
        title={dashboard.chartTitle}
        unit={dashboard.chartUnit}
        points={dashboard.points}
      />
      {dashboard.missingFields.length > 0 && (
        <p className="mt-3 text-[11px] leading-5 text-[#6a7486]">
          Missing evidence: {dashboard.missingFields.slice(0, 4).join(", ")}
        </p>
      )}
      <p className="mt-3 text-[10px] leading-5 text-[#818b9b]">{dashboard.sourceNote}</p>
    </article>
  );
}

export default function AnalysisPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id ?? "demo";
  const {
    datasets,
    readiness,
    analysis,
    analysisRun,
    dataError,
    brief,
    runAnalysis,
  } = useDemo();

  useEffect(() => {
    if (datasets.length === 0 || dataError) return;
    if (analysis?.dashboards.length) return;
    runAnalysis();
  }, [analysis, dataError, datasets.length, runAnalysis]);

  const dashboards = useMemo(() => {
    if (analysis?.dashboards.length) return analysis.dashboards;
    if (brief?.metrics.length) return buildMetricDashboards(datasets, brief, analysis);
    return [];
  }, [analysis, brief, datasets]);

  const question =
    analysis?.question ||
    analysisQuestion(brief, analysis) ||
    "What can the selected metrics and uploaded files answer right now?";
  const takeaway =
    dashboards.find((item) => item.status === "calculated")?.sentence ??
    dashboards.find((item) => item.status === "partial")?.sentence ??
    dashboards[0]?.sentence ??
    analysis?.insight.headline ??
    "Dashboards appear after a strategy or problem, a measurement plan, and local files are available.";
  const calculatedCount = dashboards.filter((item) => item.status === "calculated").length;
  const partialCount = dashboards.filter((item) => item.status === "partial").length;
  const missingCount = dashboards.filter((item) => item.status === "unanswerable").length;
  const answerability = readiness?.answerability;
  const canAnswer = readiness?.canAnswer ?? [];
  const cannotAnswer = readiness?.cannotAnswer ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analysis"
        title={question}
        description="Each dashboard is generated from the confirmed strategy or problem, the measurement plan, and the files profiled in this browser. Code calculates the numbers. Missing fields stay blank."
        action={
          <div className="flex flex-wrap gap-2">
            {datasets.length > 0 && (
              <Button
                variant="secondary"
                onClick={runAnalysis}
                data-testid="run-analysis"
              >
                Recalculate
              </Button>
            )}
            {analysisRun && analysis && (
              <Link
                href={`/workspace/${workspaceId}/story`}
                className="inline-flex min-h-10 items-center justify-center rounded-[6px] bg-[#3157c9] px-4 text-[13px] font-semibold text-white"
                data-testid="continue-story"
              >
                Generate executive story
              </Link>
            )}
          </div>
        }
      />

      {dataError && (
        <div className="rounded-[8px] border border-[#efd3cf] bg-[#fff8f7] p-4 text-[12px] leading-5 text-[#76524e]">
          {dataError}
        </div>
      )}

      <section className="surface p-6">
        <p className="eyebrow">Inputs used</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[8px] border border-[#e5e9ef] bg-[#fbfcfe] px-4 py-3">
            <p className="text-[11px] font-medium text-[#7a8496]">
              {brief?.intentKind === "problem" ? "Problem" : "Strategy"}
            </p>
            <p className="mt-1 text-[14px] font-semibold text-[#1f2d46]">
              {brief?.title ?? "Not confirmed"}
            </p>
          </div>
          <div className="rounded-[8px] border border-[#e5e9ef] px-4 py-3">
            <p className="text-[11px] font-medium text-[#7a8496]">Measurement plan</p>
            <p className="mt-1 text-[14px] font-semibold text-[#1f2d46]">
              {brief?.metrics.length
                ? `${brief.metrics.length} metrics`
                : "No metrics selected"}
            </p>
          </div>
          <div className="rounded-[8px] border border-[#e5e9ef] px-4 py-3">
            <p className="text-[11px] font-medium text-[#7a8496]">Local files</p>
            <p className="mt-1 text-[14px] font-semibold text-[#1f2d46]">
              {datasets.length
                ? `${datasets.length} file${datasets.length === 1 ? "" : "s"} · ${datasets.reduce((sum, item) => sum + item.rowCount, 0).toLocaleString()} rows`
                : "No files uploaded"}
            </p>
          </div>
        </div>
        <p className="mt-4 text-[12px] leading-5 text-[#667385]">
          Raw People rows stay in this browser. Protected attributes are not used as action
          drivers.
        </p>
      </section>

      <section className="surface p-6" data-testid="analysis-takeaway">
        <p className="eyebrow">Takeaway</p>
        <h2 className="mt-3 max-w-3xl text-[22px] font-[650] leading-8 tracking-[-0.03em] text-[#15233e]">
          {takeaway}
        </h2>
        <div className="mt-4 flex flex-wrap gap-4 text-[12px] text-[#546277]">
          <span>{calculatedCount} calculated</span>
          <span>{partialCount} partial</span>
          <span>{missingCount} missing evidence</span>
          {typeof answerability === "number" && (
            <span>Answerability {answerability}%</span>
          )}
        </div>
        {analysis && <div className="mt-4"><ConfidenceBadge level={analysis.insight.confidence} /></div>}
      </section>

      {analysis && analysis.chartPoints.length > 0 && (
        <section className="surface p-6" data-testid="analysis-chart">
          <p className="eyebrow">Evidence chart</p>
          <h2 className="mt-3 text-[18px] font-semibold text-[#1c2b44]">
            {analysis.chartTitle}
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[#3d4b61]">
            {analysis.insight.headline}
          </p>
          <EvidenceChart
            title={analysis.chartUnit === "days" ? "Median days by stage" : analysis.chartTitle}
            unit={analysis.chartUnit}
            height={290}
            points={analysis.chartPoints.map((point) => ({
              label: point.stage,
              value: point.medianDays,
            }))}
          />
        </section>
      )}

      {dashboards.length > 0 ? (
        <section className="space-y-4" data-testid="metric-dashboards">
          <div>
            <p className="eyebrow">Metric dashboards</p>
            <p className="mt-2 text-[13px] leading-6 text-[#546277]">
              One view per metric on the measurement plan. Each card states what the files
              can or cannot calculate in a single sentence.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {dashboards.map((dashboard) => (
              <DashboardCard key={dashboard.id} dashboard={dashboard} />
            ))}
          </div>
        </section>
      ) : (
        <section className="surface p-6" data-testid="analysis-empty">
          <p className="eyebrow">No chart yet</p>
          <p className="mt-3 text-[13px] leading-6 text-[#546277]">
            Charts are generated only after the first three steps. This page does not invent
            a demo chart.
          </p>
          <ol className="mt-4 space-y-2 text-[13px] leading-6 text-[#3d4b61]">
            <li>1. Confirm a strategy or problem</li>
            <li>2. Confirm the measurement plan</li>
            <li>3. Upload a People file in Data</li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={`/workspace/${workspaceId}/strategy`}
              className="inline-flex min-h-10 items-center justify-center rounded-[6px] bg-[#3157c9] px-4 text-[13px] font-semibold text-white"
            >
              Start with strategy
            </Link>
            <Link
              href={`/workspace/${workspaceId}/data`}
              className="inline-flex min-h-10 items-center justify-center rounded-[6px] border border-[#d6dce5] bg-white px-4 text-[13px] font-semibold text-[#24324b]"
            >
              Upload files
            </Link>
          </div>
        </section>
      )}

      {analysisRun && analysis && (
        <section className="space-y-5" data-testid="analysis-result">
          <div
            className="grid gap-4 sm:grid-cols-3"
            data-testid="local-analysis-summary"
          >
            <div className="surface p-5">
              <p className="eyebrow">What the files can calculate</p>
              <p className="mt-3 text-[16px] font-semibold text-[#1d2b45]">
                {analysis.metricName}
              </p>
              <p className="metric-number mt-3">{analysis.headlineValue}</p>
              <p className="mt-2 text-[11px] text-[#667385]">
                {analysis.valueCaption} · {analysis.metricDefinition}
              </p>
            </div>
            <div className="surface p-5">
              <p className="eyebrow">What we can answer</p>
              <ul className="mt-3 space-y-1 text-[12px] leading-5 text-[#546277]">
                {canAnswer.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="surface p-5">
              <p className="eyebrow">What remains unknown</p>
              <ul className="mt-3 space-y-1 text-[12px] leading-5 text-[#546277]">
                {cannotAnswer.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="surface p-6">
            <p className="eyebrow">Evidence</p>
            <ul className="mt-4 space-y-2 text-[13px] leading-6 text-[#3d4b61]">
              {analysis.insight.evidence.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
            <div className="mt-5 border-l-2 border-[#c38a45] bg-[#fcf8f1] px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b5a20]">
                Limitation
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[#685b4c]">
                {analysis.insight.limitation}
              </p>
            </div>
            <p className="mt-4 text-[12px] font-semibold text-[#334057]">Next action</p>
            <p className="mt-1 text-[13px] leading-6 text-[#3d4b61]">{analysis.action.title}</p>
            <p className="mt-4 text-[10px] leading-5 text-[#818b9b]">
              Uploaded data · local calculation. {analysis.sourceNote}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
