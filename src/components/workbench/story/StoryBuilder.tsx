"use client";

import { useState } from "react";
import {
  BookOpenText,
  CheckCircle2,
  Download,
  LoaderCircle,
  Pin,
  Presentation,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InsightChart } from "@/components/workbench/analysis/InsightChart";
import type { ExecutiveStory, Insight } from "@/types/workbench";

type Audience = ExecutiveStory["audience"];
type Purpose = ExecutiveStory["purpose"];

interface StoryBuilderProps {
  insights: Insight[];
  story: ExecutiveStory | null;
  busy?: boolean;
  onToggleInsight: (insightId: string) => void;
  onBuildStory: (
    audience: Audience,
    purpose: Purpose,
    slideCount: 3 | 5,
  ) => Promise<void> | void;
  onExport: () => Promise<void> | void;
}

export function StoryBuilder({
  insights,
  story,
  busy = false,
  onToggleInsight,
  onBuildStory,
  onExport,
}: StoryBuilderProps) {
  const [audience, setAudience] = useState<Audience>("HR Leadership Team");
  const [purpose, setPurpose] = useState<Purpose>("Recommend action");
  const [slideCount, setSlideCount] = useState<3 | 5>(3);
  const selected = insights.filter((insight) => insight.selectedForExecutiveStory);

  return (
    <div className="mx-auto w-full max-w-[1080px] px-5 py-8 sm:px-8 lg:px-10">
      <header className="border-b border-[#dfe3e9] pb-7">
        <p className="eyebrow">Story · Decision-ready narrative</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="max-w-3xl text-[28px] font-semibold leading-[1.2] tracking-[-0.035em] text-[#14213b] sm:text-[32px]">
              What should leaders know—and what should they do next?
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#5d697c]">
              Build from findings you validated. The story does not reopen raw data or
              invent a causal claim.
            </p>
          </div>
          {story && (
            <Button
              onClick={() => void onExport()}
              disabled={busy}
              data-testid="download-pptx"
            >
              {busy ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Download aria-hidden="true" className="size-4" />
              )}
              Download editable PPTX
            </Button>
          )}
        </div>
      </header>

      <div className="mt-7 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-[9px] border border-[#dfe3e9] bg-white p-5">
            <div className="flex items-center gap-2">
              <BookOpenText aria-hidden="true" className="size-4 text-[#4966b3]" />
              <h2 className="text-[13px] font-semibold text-[#344158]">Story brief</h2>
            </div>

            <label className="mt-5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#818a99]">
              Audience
              <select
                value={audience}
                onChange={(event) => setAudience(event.target.value as Audience)}
                className="mt-2 h-10 w-full rounded-[6px] border border-[#ccd3de] bg-white px-3 text-[12px] font-medium normal-case tracking-normal text-[#344158] outline-none focus:border-[#7f94d2]"
              >
                <option>CHRO</option>
                <option>HR Leadership Team</option>
                <option>Business Leadership</option>
                <option>TA Leadership</option>
                <option>People Analytics Leadership</option>
              </select>
            </label>

            <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#818a99]">
              Purpose
              <select
                value={purpose}
                onChange={(event) => setPurpose(event.target.value as Purpose)}
                className="mt-2 h-10 w-full rounded-[6px] border border-[#ccd3de] bg-white px-3 text-[12px] font-medium normal-case tracking-normal text-[#344158] outline-none focus:border-[#7f94d2]"
              >
                <option>Inform</option>
                <option>Diagnose</option>
                <option>Recommend action</option>
                <option>Strategy review</option>
              </select>
            </label>

            <fieldset className="mt-4">
              <legend className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#818a99]">
                Length
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([3, 5] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={slideCount === count}
                    onClick={() => setSlideCount(count)}
                    className={`min-h-10 rounded-[6px] border text-[12px] font-semibold ${
                      slideCount === count
                        ? "border-[#8fa3d9] bg-[#eef2fb] text-[#3153ad]"
                        : "border-[#d7dce4] bg-white text-[#617086]"
                    }`}
                  >
                    {count} slides
                  </button>
                ))}
              </div>
            </fieldset>

            <Button
              className="mt-5 w-full"
              disabled={selected.length === 0 || busy}
              onClick={() => void onBuildStory(audience, purpose, slideCount)}
              data-testid="generate-story"
            >
              <Sparkles aria-hidden="true" className="size-4" />
              {story ? "Regenerate preview" : "Generate preview"}
            </Button>

            <div className="mt-4 flex items-start gap-2 rounded-[7px] border border-[#d9e4dd] bg-[#f6faf7] p-3">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-[#3f7d61]"
              />
              <p className="text-[10px] leading-4 text-[#4d6959]">
                Story Builder receives validated insights and chart specs—not employee
                rows.
              </p>
            </div>
          </section>

          <section className="rounded-[9px] border border-[#dfe3e9] bg-white">
            <div className="border-b border-[#e7eaf0] px-5 py-4">
              <h2 className="text-[13px] font-semibold text-[#344158]">
                Validated findings
              </h2>
              <p className="mt-1 text-[11px] text-[#7b8494]">
                {selected.length} selected for this story
              </p>
            </div>
            <div className="max-h-[420px] divide-y divide-[#edf0f3] overflow-y-auto">
              {insights.length === 0 ? (
                <p className="px-5 py-5 text-[11px] leading-5 text-[#7b8494]">
                  Run the analysis and validate findings first.
                </p>
              ) : (
                insights.map((insight) => (
                  <button
                    type="button"
                    key={insight.id}
                    onClick={() => onToggleInsight(insight.id)}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-[#f8f9fb]"
                    aria-pressed={insight.selectedForExecutiveStory}
                  >
                    {insight.selectedForExecutiveStory ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-[#3f7d61]"
                      />
                    ) : (
                      <Pin
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-[#9ba3b0]"
                      />
                    )}
                    <span className="text-[11px] font-semibold leading-5 text-[#48566d]">
                      {insight.headline}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <section aria-labelledby="story-preview-heading">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                id="story-preview-heading"
                className="text-[15px] font-semibold text-[#24324a]"
              >
                Executive preview
              </h2>
              <p className="mt-1 text-[12px] text-[#717b8b]">
                One takeaway, one chart, and no more than three evidence points per page.
              </p>
            </div>
            {story && (
              <Badge variant="info">
                {story.status} · {story.slides.length} editable slides
              </Badge>
            )}
          </div>

          {!story ? (
            <div className="mt-4 grid min-h-[480px] place-items-center rounded-[9px] border border-dashed border-[#d4d9e2] bg-white p-8 text-center">
              <div>
                <Presentation
                  aria-hidden="true"
                  className="mx-auto size-6 text-[#7685a2]"
                />
                <p className="mt-3 text-[13px] font-semibold text-[#445269]">
                  Select validated findings and generate a preview
                </p>
                <p className="mx-auto mt-2 max-w-sm text-[11px] leading-5 text-[#7b8494]">
                  A 3-slide brief focuses on the decision; a 5-slide diagnostic adds
                  evidence depth and limitations.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              {story.slides.map((slide, slideIndex) => (
                <article
                  key={slide.id}
                  className="aspect-[16/9] min-h-[360px] overflow-hidden rounded-[9px] border border-[#d9dee7] bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)] sm:p-8"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#4563b3]">
                      {slide.kicker}
                    </p>
                    <p className="text-[10px] font-semibold tabular-nums text-[#9aa2af]">
                      {slideIndex + 1}/{story.slides.length}
                    </p>
                  </div>
                  <h3 className="mt-3 max-w-[86%] text-[20px] font-semibold leading-[1.25] tracking-[-0.025em] text-[#182640] sm:text-[24px]">
                    {slide.headline}
                  </h3>
                  <div className="mt-4 grid h-[calc(100%-116px)] gap-5 sm:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="min-h-0">
                      {slide.chartSpec ? (
                        <InsightChart spec={slide.chartSpec} />
                      ) : (
                        <div className="grid h-full place-items-center rounded-[7px] bg-[#f5f7fb] text-[11px] text-[#778294]">
                          Takeaway slide
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8b94a3]">
                        Evidence
                      </p>
                      <ul className="mt-2 space-y-2 text-[11px] font-medium leading-4 text-[#48566d]">
                        {slide.evidence.slice(0, 3).map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                      {slide.limitation && (
                        <p className="mt-auto border-l-2 border-[#d7aa67] pl-2 text-[9px] leading-4 text-[#785f3e]">
                          {slide.limitation}
                        </p>
                      )}
                      <p className="mt-3 text-[8px] leading-3 text-[#969eab]">
                        {slide.sourceNote}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

