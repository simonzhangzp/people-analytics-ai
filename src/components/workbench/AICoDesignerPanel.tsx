"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  DatabaseZap,
  Lightbulb,
  Send,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AIIntervention, AIInterventionKind } from "@/types/workbench";

const kindConfig: Record<
  AIInterventionKind,
  { icon: typeof Lightbulb; badge: "info" | "warning" | "danger" | "success" | "neutral" }
> = {
  Proposal: { icon: Lightbulb, badge: "info" },
  "Needs confirmation": { icon: CircleHelp, badge: "warning" },
  "Data gap": { icon: DatabaseZap, badge: "warning" },
  Recommendation: { icon: Sparkles, badge: "info" },
  Applied: { icon: CheckCircle2, badge: "success" },
  Warning: { icon: AlertTriangle, badge: "danger" },
};

interface AICoDesignerPanelProps {
  interventions: AIIntervention[];
  busy?: boolean;
  onSubmitContext: (text: string) => Promise<void> | void;
  onAction?: (interventionId: string, actionId: string) => void;
}

export function AICoDesignerPanel({
  interventions,
  busy = false,
  onSubmitContext,
  onAction,
}: AICoDesignerPanelProps) {
  const [draft, setDraft] = useState("");

  const submit = async () => {
    const value = draft.trim();
    if (!value || busy) return;
    setDraft("");
    await onSubmitContext(value);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-16 shrink-0 items-center border-b border-[#e4e7ec] px-5">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#1e2a43]">
            <Sparkles aria-hidden="true" className="size-4 text-[#4564bb]" />
            AI Co-Designer
          </div>
          <p className="mt-0.5 text-[11px] text-[#7a8495]">
            AI proposes. You confirm. Code calculates.
          </p>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5"
        aria-live="polite"
      >
        {interventions.length === 0 ? (
          <div className="border-l-2 border-[#b7c3df] pl-4">
            <p className="text-[12px] font-semibold text-[#344158]">
              Add People data to start
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[#657185]">
              I will review safe schema profiles, propose meanings, and raise only
              ambiguities that could change an answer.
            </p>
          </div>
        ) : (
          interventions.map((item) => {
            const config = kindConfig[item.kind];
            const Icon = config.icon;
            return (
              <article
                key={item.id}
                className="border-b border-[#eaedf1] pb-5 last:border-0"
                data-testid={`ai-${item.kind.toLowerCase().replaceAll(" ", "-")}`}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-3.5",
                      item.kind === "Warning" ? "text-[#a95047]" : "text-[#4865b4]",
                    )}
                  />
                  <Badge variant={config.badge}>{item.kind}</Badge>
                </div>
                <h2 className="mt-3 text-[13px] font-semibold leading-5 text-[#26344d]">
                  {item.title}
                </h2>
                <p className="mt-2 text-[12px] leading-5 text-[#5d697c]">{item.body}</p>
                {item.rationale && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[11px] font-semibold text-[#5067a8]">
                      Why this matters
                    </summary>
                    <p className="mt-2 text-[11px] leading-5 text-[#707a8b]">
                      {item.rationale}
                    </p>
                  </details>
                )}
                {item.actions && item.actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.actions.map((action, index) => (
                      <Button
                        key={action.id}
                        size="sm"
                        variant={index === 0 ? "primary" : "secondary"}
                        onClick={() => onAction?.(item.id, action.id)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      <form
        className="shrink-0 border-t border-[#e4e7ec] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="co-designer-input" className="text-[11px] font-semibold text-[#4e5b70]">
          Add business context or edit the definition
        </label>
        <div className="mt-2 flex items-end gap-2 rounded-[7px] border border-[#ccd3de] bg-white p-2 focus-within:border-[#7f94d2]">
          <textarea
            id="co-designer-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder="Treat retirement separately and use beginning headcount…"
            className="min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-[12px] leading-5 text-[#24324a] outline-none placeholder:text-[#929aaa]"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || busy}
            aria-label="Send business context"
          >
            <Send aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-[#8a93a2]">
          Semantic changes always require a visible diff and your approval.
        </p>
      </form>
    </aside>
  );
}

