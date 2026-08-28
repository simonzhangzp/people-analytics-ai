"use client";

import { GraphicWalker } from "@kanaries/graphic-walker";
import "@kanaries/graphic-walker/dist/style.css";
import { ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { omitPrivateExplorationColumns } from "@/lib/local-data/privacy";
import type { DataRow } from "@/types/local-data";
import type { ColumnProfile } from "@/types/workbench";

interface GraphicWalkerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: DataRow[];
  columns: ColumnProfile[];
  sourceLabel: string;
  sampled: boolean;
}

export default function GraphicWalkerPanel({
  open,
  onOpenChange,
  rows,
  columns,
  sourceLabel,
  sampled,
}: GraphicWalkerPanelProps) {
  const safeRows = useMemo(
    () => rows.map((row) => omitPrivateExplorationColumns(row, columns)),
    [columns, rows],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-w-[min(1500px,calc(100vw-2rem))] overflow-hidden p-0">
        <DialogHeader className="border-b border-[#dfe3e9] px-6 py-4 pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Explore de-identified local rows</DialogTitle>
            <Badge variant={sampled ? "warning" : "success"}>
              {sampled
                ? `Bounded sample · ${safeRows.length.toLocaleString()} rows`
                : "Complete de-identified local rows"}
            </Badge>
          </div>
          <DialogDescription className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-3.5 text-[#3f7d61]" />
            {sourceLabel}. PII and sensitive demographics are removed before this
            local explorer receives rows. Computed expressions are disabled.
          </DialogDescription>
        </DialogHeader>
        <div className="h-[calc(90vh-92px)] overflow-auto bg-white p-3 [--primary:#3157d5]">
          {safeRows.length > 0 ? (
            <GraphicWalker
              data={safeRows}
              appearance="light"
              defaultRenderer="observable-plot"
              hideProfiling={false}
              experimentalFeatures={{ computedField: false }}
              computationTimeout={15_000}
              className="h-full min-h-[640px]"
            />
          ) : (
            <div className="grid h-full place-items-center text-[13px] text-[#687386]">
              No bounded local result is available for exploration.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

