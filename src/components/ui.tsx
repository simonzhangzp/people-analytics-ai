import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Confidence, WorkflowStatus } from "@/types/domain";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden="true"
        className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[7px] bg-[#203d91]"
      >
        <span className="absolute left-[8px] top-[7px] size-[5px] rounded-full bg-white" />
        <span className="absolute right-[7px] top-[13px] size-[5px] rounded-full bg-[#aebeff]" />
        <span className="absolute bottom-[6px] left-[12px] size-[5px] rounded-full bg-white" />
        <span className="absolute left-[10px] top-[10px] h-px w-[12px] rotate-[25deg] bg-white/70" />
        <span className="absolute bottom-[10px] left-[10px] h-px w-[11px] -rotate-[42deg] bg-white/70" />
      </div>
      {!compact && (
        <div>
          <div className="text-[14px] font-[680] leading-none tracking-[-0.01em] text-[#15213b]">
            People Strategy
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-[#718096]">
            Intelligence
          </div>
        </div>
      )}
    </div>
  );
}

export function PrimaryLink({
  href,
  children,
  className,
  testId,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[6px] bg-[#3157c9] px-5 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-[#2848aa]",
        className,
      )}
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

export function SecondaryLink({
  href,
  children,
  className,
  testId,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[6px] border border-[#d6dce5] bg-white px-5 text-[14px] font-semibold text-[#24324b] transition-colors duration-200 hover:border-[#b8c2d2] hover:bg-[#f8f9fb]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  const variants = {
    primary: "bg-[#3157c9] text-white hover:bg-[#2848aa] border-transparent",
    secondary:
      "border-[#d6dce5] bg-white text-[#24324b] hover:border-[#b8c2d2] hover:bg-[#f8f9fb]",
    ghost:
      "border-transparent bg-transparent text-[#526078] hover:bg-[#eef1f5] hover:text-[#1a2740]",
  };

  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-[6px] border px-4 text-[13px] font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-[#e5e8ed] pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="balanced text-[28px] font-[680] leading-[1.18] tracking-[-0.035em] text-[#121d35] sm:text-[32px]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#59667a]">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function StatusBadge({ status }: { status: WorkflowStatus | string }) {
  const style =
    status === "Approved" || status === "Confirmed"
      ? "bg-[#eaf5ef] text-[#2f7659] border-[#d2e8dc]"
      : status === "Ready" || status === "Mapped"
        ? "bg-[#edf2ff] text-[#3657af] border-[#dae3fb]"
        : status === "Needs input" || status === "Needs Review" || status === "Review"
          ? "bg-[#fbf2e5] text-[#9a5c17] border-[#f1dfc4]"
          : "bg-[#f1f3f6] text-[#697386] border-[#e3e6eb]";

  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold leading-none",
        style,
      )}
    >
      {(status === "Approved" || status === "Confirmed") && (
        <Check aria-hidden="true" className="size-3" />
      )}
      {status}
    </span>
  );
}

export function ConfidenceBadge({ level }: { level: Confidence }) {
  const dot =
    level === "High"
      ? "bg-[#3f8265]"
      : level === "Medium"
        ? "bg-[#b2762b]"
        : "bg-[#b65353]";
  return (
    <span className="inline-flex items-center gap-2 text-[12px] font-medium text-[#566277]">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
      Confidence: {level}
    </span>
  );
}

export function ProgressBar({
  value,
  tone = "brand",
}: {
  value: number;
  tone?: "brand" | "success" | "warning";
}) {
  const bar =
    tone === "success"
      ? "bg-[#4b8c6d]"
      : tone === "warning"
        ? "bg-[#bd8241]"
        : "bg-[#4868c9]";

  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-[#e9edf2]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div className={cn("h-full rounded-full", bar)} style={{ width: `${value}%` }} />
    </div>
  );
}

export function AILabel({ children = "AI suggestion" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-[#425da9]">
      <Sparkles aria-hidden="true" className="size-3.5" />
      {children}
    </span>
  );
}

export function IconTile({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="flex size-9 items-center justify-center rounded-[7px] border border-[#dfe5f2] bg-[#f4f6fc] text-[#3a5ab4]">
      <Icon aria-label={label} className="size-4.5" />
    </div>
  );
}
