import type { ShipStatus } from "@/lib/people/architecture-map";
import { cn } from "@/lib/utils";

/**
 * Live vs Target-architecture boundary marker (brief §12). Reuses Badge palette:
 * live = success soft, target = warning soft. Never render a target item without it.
 */
export function LiveTag({
  status,
  className,
  compact = false,
}: {
  status: ShipStatus | "mixed";
  className?: string;
  compact?: boolean;
}) {
  const label =
    status === "live" ? "Live" : status === "target" ? "Target architecture" : "Live + target";
  const tone =
    status === "live"
      ? "border-certified-line bg-certified-soft text-certified-dark"
      : status === "target"
        ? "border-gold-line bg-gold-soft text-gold-dark"
        : "border-primary-ring bg-primary-soft text-primary-deep";
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold leading-none",
        compact ? "min-h-5 px-2 text-[10px]" : "min-h-6 px-2.5 text-[11px]",
        tone,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          status === "live" ? "bg-certified" : status === "target" ? "bg-gold" : "bg-primary",
        )}
      />
      {label}
    </span>
  );
}
