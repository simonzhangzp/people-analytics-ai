"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { storySlides as demoStorySlides } from "@/lib/demo-data";
import { useDemo } from "@/components/demo-provider";
import { Button, PageHeader } from "@/components/ui";

export default function StoryPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id ?? "demo";
  const { analysis, storyGenerated, generateStory } = useDemo();
  const [activeSlide, setActiveSlide] = useState(0);
  const storySlides = analysis?.storySlides ?? demoStorySlides;
  const slide = storySlides[activeSlide];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Executive Story"
        title="Generate a five-slide CHRO brief"
        description={
          analysis
            ? analysis.metricName === "Headcount" ||
              analysis.metricName === "Workforce mix"
              ? `Built from ${analysis.sampleSize.toLocaleString()} employees across ${analysis.sourceDatasetNames.length} local dataset${analysis.sourceDatasetNames.length === 1 ? "" : "s"}.`
              : `Built from ${analysis.sampleSize.toLocaleString()} completed hiring cycles across ${analysis.sourceDatasetNames.length} local dataset${analysis.sourceDatasetNames.length === 1 ? "" : "s"}.`
            : "Each slide leads with a conclusion, one visual, and a small set of supporting facts. Metric definitions stay visible in the footer."
        }
        action={
          storyGenerated ? (
            <Link
              href={`/workspace/${workspaceId}/actions`}
              className="inline-flex min-h-10 items-center justify-center rounded-[6px] bg-[#3157c9] px-4 text-[13px] font-semibold text-white"
              data-testid="continue-actions"
            >
              Continue to Action
            </Link>
          ) : (
            <Button onClick={generateStory} data-testid="generate-story">
              Generate 5-slide deck
            </Button>
          )
        }
      />

      {storyGenerated && (
        <section className="grid gap-5 lg:grid-cols-[180px_1fr]" data-testid="story-deck">
          <div className="space-y-2">
            {storySlides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSlide(index)}
                className={`w-full rounded-[8px] border px-3 py-3 text-left ${
                  index === activeSlide
                    ? "border-[#dbe3f8] bg-[#eef2fb]"
                    : "border-[#e5e9ef] bg-white"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7a8496]">
                  Slide {item.id}
                </p>
                <p className="mt-1 line-clamp-2 text-[12px] font-semibold text-[#24324b]">
                  {item.headline}
                </p>
              </button>
            ))}
          </div>
          <article className="surface min-h-[420px] p-8">
            <p className="eyebrow">{slide.kicker}</p>
            <h2 className="mt-4 max-w-3xl text-[26px] font-[680] leading-8 tracking-[-0.03em] text-[#15233e]">
              {slide.headline}
            </h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {slide.facts.map((fact) => (
                <li key={fact} className="rounded-[8px] border border-[#e5e9ef] bg-[#fbfcfe] px-4 py-3 text-[13px] font-medium text-[#344158]">
                  {fact}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-[11px] text-[#7a8496]">
              Source:{" "}
              {analysis
                ? `${analysis.metricName} · ${analysis.metricDefinition} · local browser calculation`
                : "Time to Fill · Approved v1.3 · Synthetic TA workspace"}
            </p>
            {analysis && (
              <p className="mt-2 text-[10px] leading-4 text-[#929aaa]">
                Evidence boundary: {analysis.insight.limitation}
              </p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
