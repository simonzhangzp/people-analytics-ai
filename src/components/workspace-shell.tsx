"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BarChart3,
  BookOpenText,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Circle,
  Database,
  FlaskConical,
  HelpCircle,
  Menu,
  PanelRight,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { aiGuidance, workflowStages } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import type { WorkflowStageId, WorkflowStatus } from "@/types/domain";
import { useDemo } from "@/components/demo-provider";
import { BrandMark, StatusBadge } from "@/components/ui";

const stageIcons = {
  strategy: Target,
  measurement: BarChart3,
  data: Database,
  analysis: BrainCircuit,
  story: BookOpenText,
  actions: FlaskConical,
};

function StageStateIcon({ status }: { status: WorkflowStatus }) {
  if (status === "Approved") {
    return <CheckCircle2 aria-hidden="true" className="size-3.5 text-[#3f7d61]" />;
  }
  if (status === "In progress" || status === "Ready" || status === "Needs input") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          status === "Needs input" ? "bg-[#b97828]" : "bg-[#4667c6]",
        )}
      />
    );
  }
  return <Circle aria-hidden="true" className="size-3.5 text-[#b9c0ca]" />;
}

function AICoDesigner({
  stage,
  onClose,
}: {
  stage: WorkflowStageId;
  onClose?: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [submitted, setSubmitted] = useState("");
  const guidance = aiGuidance[stage];

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#e4e7ec] px-5">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#1e2a43]">
            <Sparkles aria-hidden="true" className="size-4 text-[#4564bb]" />
            AI Co-Designer
          </div>
          <p className="mt-0.5 text-[11px] text-[#7a8495]">
            Human judgment stays in control
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Co-Designer"
            className="grid size-9 place-items-center rounded-[6px] text-[#667085] hover:bg-[#f1f3f6]"
          >
            <X aria-hidden="true" className="size-4.5" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <p className="eyebrow">Current context</p>
        <div className="mt-3 border-l-2 border-[#5c75c7] pl-4">
          <p className="text-[13px] font-semibold text-[#25334c]">{guidance.title}</p>
          <p className="mt-2 text-[13px] leading-5 text-[#5c687b]">{guidance.body}</p>
        </div>

        <div className="mt-6 rounded-[8px] border border-[#dfe5f2] bg-[#f7f9fe] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#4b64aa]">
              Ready to apply
            </span>
            <span className="text-[10px] font-medium text-[#7b8495]">{guidance.note}</span>
          </div>
          <p className="mt-3 text-[13px] font-semibold text-[#25334c]">{guidance.action}</p>
        </div>

        <div className="mt-6 border-t border-[#e8eaee] pt-5">
          <p className="text-[12px] font-semibold text-[#334057]">Why this recommendation?</p>
          <p className="mt-2 text-[12px] leading-5 text-[#6a7485]">
            It uses approved metric definitions and synthetic aggregate evidence. No raw
            candidate or employee rows are sent to an AI service.
          </p>
        </div>

        {submitted && (
          <div className="mt-6 space-y-3" aria-live="polite">
            <div className="rounded-[6px] bg-[#f1f3f6] px-3 py-2 text-[12px] text-[#4f5b6e]">
              {submitted}
            </div>
            <div className="border-l-2 border-[#9cacdc] pl-3 text-[12px] leading-5 text-[#4c596d]">
              I’ll keep the approved definitions unchanged and frame this as a proposal
              for your confirmation.
            </div>
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-[#e4e7ec] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!question.trim()) return;
          setSubmitted(question.trim());
          setQuestion("");
        }}
      >
        <label htmlFor="ai-question" className="sr-only">
          Ask the AI Co-Designer
        </label>
        <div className="flex items-end gap-2 rounded-[7px] border border-[#ccd3de] bg-white p-2 focus-within:border-[#7f94d2]">
          <textarea
            id="ai-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={2}
            placeholder="Add context or revise a definition…"
            className="min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-[12px] leading-5 text-[#24324a] outline-none placeholder:text-[#929aaa]"
          />
          <button
            type="submit"
            aria-label="Send message"
            className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-[#3458c5] text-white transition-colors hover:bg-[#2948a7]"
          >
            <Send aria-hidden="true" className="size-3.5" />
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-[#8a93a2]">
          Proposals require human confirmation before they become approved knowledge.
        </p>
      </form>
    </aside>
  );
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const workspaceId = params.id ?? "demo";
  const { getStageStatus, resetDemo } = useDemo();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const activeStage = useMemo<WorkflowStageId>(() => {
    const match = workflowStages.find((stage) => pathname.includes(`/${stage.id}`));
    return match?.id ?? "strategy";
  }, [pathname]);

  const currentLabel =
    workflowStages.find((stage) => stage.id === activeStage)?.label ?? "Strategy";

  const workflowRail = (
    <nav aria-label="Demo workflow" className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <p className="eyebrow">Workflow</p>
        <p className="mt-2 text-[12px] leading-5 text-[#768093]">
          Strategy to evidence and action
        </p>
      </div>
      <div className="space-y-1 px-3">
        {workflowStages.map((stage) => {
          const Icon = stageIcons[stage.id];
          const href = `/workspace/${workspaceId}/${stage.id}`;
          const active = activeStage === stage.id;
          const status = getStageStatus(stage.id);
          return (
            <Link
              key={stage.id}
              href={href}
              onClick={() => setMobileNavOpen(false)}
              aria-current={active ? "page" : undefined}
              data-testid={`nav-${stage.id}`}
              className={cn(
                "group flex min-h-14 items-center gap-3 rounded-[7px] border px-3 transition-colors",
                active
                  ? "border-[#dbe3f8] bg-[#eef2fb] text-[#23449f]"
                  : "border-transparent text-[#4e5b70] hover:bg-[#f3f5f8]",
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn("size-4.5 shrink-0", active ? "text-[#3458bd]" : "text-[#7b8596]")}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold">{stage.label}</span>
                <span className="mt-1 flex items-center gap-1.5 text-[10px] text-[#8a93a2]">
                  <StageStateIcon status={status} />
                  {status}
                </span>
              </span>
              {active && <ChevronRight aria-hidden="true" className="size-3.5" />}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto border-t border-[#e6e9ee] p-3">
        <button
          type="button"
          onClick={resetDemo}
          className="flex min-h-10 w-full items-center gap-2 rounded-[6px] px-3 text-left text-[11px] font-medium text-[#748094] hover:bg-[#f2f4f7] hover:text-[#445168]"
        >
          <RotateCcw aria-hidden="true" className="size-3.5" />
          Reset demo progress
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-[#dfe3e9] bg-white/95 px-4 backdrop-blur sm:px-6">
        <button
          type="button"
          aria-label="Open workflow navigation"
          onClick={() => setMobileNavOpen(true)}
          className="mr-3 grid size-10 place-items-center rounded-[6px] text-[#506077] hover:bg-[#f2f4f7] lg:hidden"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <Link href="/" aria-label="People Strategy Intelligence home">
          <BrandMark />
        </Link>
        <div className="ml-6 hidden h-6 w-px bg-[#e2e5ea] sm:block" />
        <div className="ml-6 hidden min-w-0 sm:block">
          <p className="truncate text-[12px] font-semibold text-[#344159]">
            People strategy workspace
          </p>
          <p className="mt-0.5 text-[10px] text-[#8992a1]">Local demo · strategy or problem first</p>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-1.5 text-[11px] font-medium text-[#6a7587] md:flex">
            <CheckCircle2 aria-hidden="true" className="size-3.5 text-[#4b8469]" />
            Saved locally
          </span>
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
          <div
            className="grid size-8 place-items-center rounded-full bg-[#e8edf9] text-[11px] font-bold text-[#3455ad]"
            aria-label="Demo user"
          >
            PA
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)] xl:grid-cols-[224px_minmax(0,1fr)_340px]">
        <aside className="hidden border-r border-[#dfe3e9] bg-white lg:block">
          <div className="sticky top-16 h-[calc(100vh-64px)]">{workflowRail}</div>
        </aside>

        <main className="min-w-0">
          <div className="border-b border-[#e1e5ea] bg-white px-5 py-3 lg:hidden">
            <div className="flex items-center justify-between">
              <div>
                <span className="eyebrow">Current stage</span>
                <p className="mt-1 text-[13px] font-semibold text-[#26344e]">{currentLabel}</p>
              </div>
              <StatusBadge status={getStageStatus(activeStage)} />
            </div>
          </div>
          <div className="mx-auto w-full max-w-[1120px] px-5 py-7 sm:px-8 sm:py-9">
            {children}
          </div>
        </main>

        <aside className="hidden border-l border-[#dfe3e9] bg-white xl:block">
          <div className="sticky top-16 h-[calc(100vh-64px)]">
            <AICoDesigner stage={activeStage} />
          </div>
        </aside>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close workflow navigation"
            className="absolute inset-0 bg-[#101828]/30"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.14)]">
            <div className="flex h-16 items-center justify-between border-b border-[#e5e8ed] px-5">
              <BrandMark />
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileNavOpen(false)}
                className="grid size-9 place-items-center rounded-[6px] hover:bg-[#f2f4f7]"
              >
                <X aria-hidden="true" className="size-4.5" />
              </button>
            </div>
            <div className="h-[calc(100%-64px)]">{workflowRail}</div>
          </aside>
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
          <div className="absolute inset-y-0 right-0 w-full max-w-[380px] shadow-[0_8px_24px_rgba(15,23,42,0.14)]">
            <AICoDesigner stage={activeStage} onClose={() => setAiOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
