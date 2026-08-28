"use client";

import { GraphicWalker } from "@kanaries/graphic-walker";
import "@kanaries/graphic-walker/dist/style.css";
import { ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { DataRow } from "@/types/local-data";

interface GraphicWalkerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: DataRow[];
  sourceLabel: string;
  sampled: boolean;
}

export default function GraphicWalkerPanel({
  open,
  onOpenChange,
  rows,
  sourceLabel,
  sampled,
}: GraphicWalkerPanelProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-w-[min(1500px,calc(100vw-2rem))] overflow-hidden p-0">
        <DialogHeader className="border-b border-[#dfe3e9] px-6 py-4 pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Explore local aggregate data</DialogTitle>
            <Badge variant={sampled ? "warning" : "success"}>
              {sampled ? `Sampled · ${rows.length.toLocaleString()} rows` : "Complete local result"}
            </Badge>
          </div>
          <DialogDescription className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-3.5 text-[#3f7d61]" />
            {sourceLabel}. Exploration stays in this browser. Computed expressions are
            disabled.
          </DialogDescription>
        </DialogHeader>
        <div className="h-[calc(90vh-92px)] overflow-auto bg-white p-3 [--primary:#3157d5]">
          {rows.length > 0 ? (
            <GraphicWalker
              data={rows}
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

