import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden="true"
        className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-ink"
      >
        <span className="absolute left-[8px] top-[7px] size-[5px] rounded-full bg-white" />
        <span className="absolute right-[7px] top-[13px] size-[5px] rounded-full bg-primary-ring" />
        <span className="absolute bottom-[6px] left-[12px] size-[5px] rounded-full bg-white" />
        <span className="absolute left-[10px] top-[10px] h-px w-[12px] rotate-[25deg] bg-white/70" />
        <span className="absolute bottom-[10px] left-[10px] h-px w-[11px] -rotate-[42deg] bg-white/70" />
      </div>
      {!compact && (
        <div>
          <div className="display text-[15px] font-bold leading-none tracking-[-0.02em] text-ink">
            PeopleAnalyticsAI
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-muted">
            Enterprise People Data & AI
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
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-primary px-5 text-[14px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(36,86,246,0.7)] transition-colors duration-200 hover:bg-primary-dark",
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
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-edge-strong bg-white px-5 text-[14px] font-semibold text-ink transition-colors duration-200 hover:border-edge-strong hover:bg-canvas-2",
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
    primary: "bg-primary text-white hover:bg-primary-dark border-transparent",
    secondary:
      "border-edge-strong bg-white text-ink hover:border-edge-strong hover:bg-canvas-2",
    ghost:
      "border-transparent bg-transparent text-body hover:bg-edge hover:text-ink",
  };

  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border px-4 text-[13px] font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-55",
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
    <header className="flex flex-col gap-5 border-b border-edge pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="balanced text-[28px] font-[680] leading-[1.18] tracking-[-0.035em] text-ink sm:text-[32px]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-6 text-body-2">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const style =
    status === "Approved" || status === "Confirmed"
      ? "bg-certified-soft text-certified-dark border-certified-line"
      : status === "Ready" || status === "Mapped"
        ? "bg-primary-soft text-primary-deep border-primary-ring"
        : status === "Needs input" || status === "Needs Review" || status === "Review"
          ? "bg-gold-soft text-gold-dark border-gold-line"
          : "bg-canvas-2 text-muted border-edge";

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

export function ConfidenceBadge({ level }: { level: string }) {
  const dot =
    level === "High"
      ? "bg-certified"
      : level === "Medium"
        ? "bg-gold"
        : "bg-danger";
  return (
    <span className="inline-flex items-center gap-2 text-[12px] font-medium text-body">
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
      ? "bg-certified"
      : tone === "warning"
        ? "bg-gold"
        : "bg-primary";

  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-edge"
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
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-primary">
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
    <div className="flex size-9 items-center justify-center rounded-[8px] border border-edge-strong bg-canvas-2 text-primary">
      <Icon aria-label={label} className="size-4.5" />
    </div>
  );
}
