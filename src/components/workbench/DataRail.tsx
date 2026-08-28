"use client";

import {
  BarChart3,
  BookOpenText,
  CheckCircle2,
  Circle,
  Database,
  FileSpreadsheet,
  Ruler,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import type {
  LocalWorkbenchDataset,
  WorkbenchProgress,
  WorkbenchView,
} from "@/types/workbench";

const views: Array<{
  id: WorkbenchView;
  label: string;
  description: string;
  icon: typeof Database;
}> = [
  { id: "data", label: "Data", description: "Files and relationships", icon: Database },
  { id: "metrics", label: "Metrics", description: "Definitions and rules", icon: Ruler },
  { id: "analysis", label: "Analysis", description: "Evidence thread", icon: BarChart3 },
  { id: "story", label: "Story", description: "Executive narrative", icon: BookOpenText },
];

function ProgressIcon({ value }: { value: string }) {
  if (value === "Ready") {
    return <CheckCircle2 aria-hidden="true" className="size-3.5 text-[#3f7d61]" />;
  }
  if (value === "In progress" || value === "Needs input") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          value === "Needs input" ? "bg-[#b97828]" : "bg-[#4667c6]",
        )}
      />
    );
  }
  if (value === "Blocked") {
    return <span aria-hidden="true" className="size-2 rounded-full bg-[#a95047]" />;
  }
  return <Circle aria-hidden="true" className="size-3.5 text-[#b9c0ca]" />;
}

interface DataRailProps {
  activeView: WorkbenchView;
  onViewChange: (view: WorkbenchView) => void;
  datasets: LocalWorkbenchDataset[];
  progress: WorkbenchProgress;
  activeDatasetId?: string;
  onSelectDataset?: (datasetId: string) => void;
}

export function DataRail({
  activeView,
  onViewChange,
  datasets,
  progress,
  activeDatasetId,
  onSelectDataset,
}: DataRailProps) {
  return (
    <nav aria-label="Workbench navigation" className="flex h-full min-h-0 flex-col">
      <div className="px-5 pb-4 pt-5">
        <p className="eyebrow">Workbench</p>
        <p className="mt-2 text-[12px] leading-5 text-[#768093]">
          Meaning first. Evidence next.
        </p>
      </div>

      <div className="space-y-1 px-3">
        {views.map((view) => {
          const Icon = view.icon;
          const active = activeView === view.id;
          const state = progress[view.id];
          return (
            <button
              type="button"
              key={view.id}
              onClick={() => onViewChange(view.id)}
              aria-current={active ? "page" : undefined}
              data-testid={`workbench-nav-${view.id}`}
              className={cn(
                "flex min-h-14 w-full items-center gap-3 rounded-[7px] border px-3 text-left transition-colors",
                active
                  ? "border-[#dbe3f8] bg-[#eef2fb] text-[#23449f]"
                  : "border-transparent text-[#4e5b70] hover:bg-[#f3f5f8]",
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-4.5 shrink-0",
                  active ? "text-[#3458bd]" : "text-[#7b8596]",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold">{view.label}</span>
                <span className="mt-1 flex items-center gap-1.5 text-[10px] text-[#8a93a2]">
                  <ProgressIcon value={state} />
                  {state}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mx-4 mt-5 border-t border-[#e7eaf0]" />
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-4">
        <div className="flex items-center justify-between px-2">
          <p className="eyebrow">Local data</p>
          <Badge variant={datasets.length ? "success" : "neutral"}>
            {datasets.length} file{datasets.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {datasets.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[#d8dde6] p-4">
              <FileSpreadsheet aria-hidden="true" className="size-4 text-[#72809a]" />
              <p className="mt-2 text-[12px] font-semibold text-[#4a576b]">
                No files attached
              </p>
              <p className="mt-1 text-[11px] leading-4 text-[#818a99]">
                Add 1–3 files in Data to begin.
              </p>
            </div>
          ) : (
            datasets.map(({ metadata }) => (
              <button
                type="button"
                key={metadata.id}
                onClick={() => onSelectDataset?.(metadata.id)}
                className={cn(
                  "w-full rounded-[7px] border p-3 text-left transition-colors",
                  activeDatasetId === metadata.id
                    ? "border-[#cbd7f5] bg-[#f3f6fd]"
                    : "border-[#e3e7ed] bg-white hover:bg-[#f8f9fb]",
                )}
              >
                <div className="flex items-start gap-2">
                  <FileSpreadsheet
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-[#566fae]"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-[#2d3a50]">
                      {metadata.name}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-[#7b8494]">
                      {metadata.inferredType}
                    </p>
                    <p className="mt-1 text-[10px] tabular-nums text-[#7b8494]">
                      {formatNumber(metadata.rowCount)} rows · {metadata.healthScore}/100
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-[7px] border border-[#d8e4dd] bg-[#f6faf7] p-3">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-[#3f7d61]"
          />
          <p className="text-[10px] leading-4 text-[#4f6b5b]">
            Raw rows are session-only. Safe definitions and aggregate evidence may sync.
          </p>
        </div>
      </div>
    </nav>
  );
}

