"use client";

import Link from "next/link";
import { recommendedAction as demoRecommendedAction } from "@/lib/demo-data";
import { useDemo } from "@/components/demo-provider";
import { Button, PageHeader, StatusBadge } from "@/components/ui";

export default function ActionsPage() {
  const { analysis, pilotCreated, createPilot } = useDemo();
  const recommendedAction = analysis?.action ?? demoRecommendedAction;
  const currentMetric = analysis?.headlineValue
    ? analysis.headlineValue
    : analysis?.currentDays
      ? `${analysis.currentDays} days`
      : "59 days";
  const metricName = analysis?.metricName ?? "Time to Fill";
  const isWorkforceMetric =
    analysis?.metricName === "Headcount" || analysis?.metricName === "Workforce mix";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Action"
        title="Turn the insight into an experiment"
        description={
          analysis
            ? isWorkforceMetric
              ? `This recommendation is tied to the evidence boundary of ${analysis.sampleSize.toLocaleString()} employees in the uploaded extract.`
              : `This recommendation is derived from the longest measured stage in ${analysis.sampleSize.toLocaleString()} completed hiring cycles.`
            : "The recommended action is tied to a success metric, a guardrail, an owner, and a review window."
        }
        action={
          <Button onClick={createPilot} data-testid="create-pilot">
            {pilotCreated ? "Pilot created" : "Create pilot"}
          </Button>
        }
      />

      <section className="surface p-6 sm:p-7" data-testid="action-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="eyebrow">Recommended action</p>
          <StatusBadge status={pilotCreated ? "Approved" : "Proposed"} />
        </div>
        <h2 className="mt-4 max-w-3xl text-[22px] font-[650] leading-8 tracking-[-0.03em] text-[#15233e]">
          {recommendedAction.title}
        </h2>
        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          {[
            ["Evidence", recommendedAction.evidence],
            ["Hypothesis", recommendedAction.hypothesis],
            ["Owner", recommendedAction.owner],
            ["Pilot population", recommendedAction.population],
            ["Success metric", recommendedAction.successMetric],
            ["Guardrail", recommendedAction.guardrail],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-medium text-[#7a8496]">{label}</dt>
              <dd className="mt-1 text-[13px] leading-6 text-[#344158]">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="surface p-6">
        <p className="eyebrow">Strategy scorecard</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            ["Current", currentMetric, metricName],
            [
              "Target",
              analysis?.comparisonValid ? `${analysis.targetDays} days` : "Not comparable",
              analysis?.comparisonValid
                ? "Q4 2027"
                : "Time to Fill fields missing",
            ],
            [
              "Recommended focus",
              recommendedAction.successMetric,
              recommendedAction.duration,
            ],
          ].map(([label, value, note]) => (
            <div key={label} className="rounded-[8px] border border-[#e5e9ef] px-4 py-4">
              <p className="text-[11px] text-[#7a8496]">{label}</p>
              <p className="mt-2 text-[16px] font-semibold text-[#1c2b44]">{value}</p>
              <p className="mt-1 text-[12px] text-[#667385]">{note}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[12px] leading-5 text-[#667385]">
          Next review: four weeks after the pilot starts. {recommendedAction.guardrail}{" "}
          is the explicit guardrail.
        </p>
        {analysis && (
          <p className="mt-3 text-[10px] leading-5 text-[#8992a1]">
            {analysis.sourceNote}
          </p>
        )}
        <Link
          href="/architecture"
          className="mt-5 inline-flex text-[13px] font-semibold text-[#3156bc]"
        >
          See how the architecture works
        </Link>
      </section>
    </div>
  );
}
