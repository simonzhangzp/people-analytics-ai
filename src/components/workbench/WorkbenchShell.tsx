"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BookOpenText,
  CheckCircle2,
  HelpCircle,
  Menu,
  PanelRight,
  ShieldCheck,
} from "lucide-react";
import { BrandMark } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface WorkbenchShellProps {
  workspaceName: string;
  engineStatus: "idle" | "loading" | "ready" | "error";
  persistenceStatus: "local-only" | "syncing" | "synced" | "unavailable";
  storyCount: number;
  dataRail: React.ReactNode;
  aiPanel: React.ReactNode;
  children: React.ReactNode;
  onOpenStory: () => void;
}

export function WorkbenchShell({
  workspaceName,
  engineStatus,
  persistenceStatus,
  storyCount,
  dataRail,
  aiPanel,
  children,
  onOpenStory,
}: WorkbenchShellProps) {
  const [dataOpen, setDataOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-[#dfe3e9] bg-white/96 px-4 sm:px-6">
        <Dialog open={dataOpen} onOpenChange={setDataOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open data workspace"
              className="mr-2 lg:hidden"
            >
              <Menu aria-hidden="true" className="size-5" />
            </Button>
          </DialogTrigger>
          <DialogContent side="left" className="p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>Data workspace</DialogTitle>
              <DialogDescription>
                Files, mappings, metrics, analysis, and story.
              </DialogDescription>
            </DialogHeader>
            {dataRail}
          </DialogContent>
        </Dialog>

        <Link href="/" aria-label="People Analytics Workbench home">
          <BrandMark />
        </Link>

        <div className="ml-6 hidden h-6 w-px bg-[#e2e5ea] sm:block" />
        <div className="ml-6 hidden min-w-0 sm:block">
          <p className="truncate text-[12px] font-semibold text-[#344159]">
            {workspaceName}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#7c8798]">
            <ShieldCheck aria-hidden="true" className="size-3 text-[#3f7d61]" />
            Raw People rows stay in this browser
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden md:inline-flex">
            {engineStatus === "ready" ? (
              <Badge variant="success">
                <CheckCircle2 aria-hidden="true" className="size-3" />
                Local engine ready
              </Badge>
            ) : engineStatus === "loading" ? (
              <Badge variant="info">Starting local engine</Badge>
            ) : engineStatus === "error" ? (
              <Badge variant="danger">Engine needs attention</Badge>
            ) : (
              <Badge>Local session</Badge>
            )}
          </span>

          <span className="hidden xl:inline-flex">
            <Badge variant={persistenceStatus === "synced" ? "success" : "neutral"}>
              {persistenceStatus === "synced"
                ? "Knowledge synced"
                : persistenceStatus === "syncing"
                  ? "Syncing"
                  : persistenceStatus === "unavailable"
                    ? "Local fallback"
                    : "Local only"}
            </Badge>
          </span>

          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenStory}
            data-testid="story-tray-button"
          >
            <BookOpenText aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Executive Story</span>
            <span aria-label={`${storyCount} selected insights`}>({storyCount})</span>
          </Button>

          <Dialog open={aiOpen} onOpenChange={setAiOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open AI Co-Designer"
                className="xl:hidden"
              >
                <PanelRight aria-hidden="true" className="size-4.5" />
              </Button>
            </DialogTrigger>
            <DialogContent side="right" className="p-0">
              <DialogHeader className="sr-only">
                <DialogTitle>AI Co-Designer</DialogTitle>
                <DialogDescription>
                  Structured proposals, confirmations, gaps, and recommendations.
                </DialogDescription>
              </DialogHeader>
              {aiPanel}
            </DialogContent>
          </Dialog>

          <Link
            href="/architecture"
            aria-label="Help and architecture"
            className="hidden size-10 place-items-center rounded-[6px] text-[#667287] hover:bg-[#f2f4f7] sm:grid"
          >
            <HelpCircle aria-hidden="true" className="size-4.5" />
          </Link>
          <div
            className="grid size-8 place-items-center rounded-full bg-[#e8edf9] text-[11px] font-bold text-[#3455ad]"
            aria-label="Anonymous workspace"
          >
            PA
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_380px]">
        <aside className="hidden border-r border-[#dfe3e9] bg-white lg:block">
          <div className="sticky top-16 h-[calc(100vh-64px)] overflow-hidden">{dataRail}</div>
        </aside>

        <main className="min-w-0 overflow-x-hidden">{children}</main>

        <aside className="hidden border-l border-[#dfe3e9] bg-white xl:block">
          <div className="sticky top-16 h-[calc(100vh-64px)] overflow-hidden">{aiPanel}</div>
        </aside>
      </div>

    </div>
  );
}

