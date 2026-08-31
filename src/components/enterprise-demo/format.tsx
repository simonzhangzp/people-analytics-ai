"use client";

import { Badge } from "@/components/ui/badge";

export function QualityBadge({ status }: { status?: string | null }) {
  if (status === "unhealthy") {
    return (
      <Badge variant="danger" data-testid="quality-unhealthy">
        Not trusted
      </Badge>
    );
  }
  if (status === "healthy") {
    return <Badge variant="success">Certified quality</Badge>;
  }
  return <Badge variant="neutral">{status || "unknown"}</Badge>;
}

export function TrustIndicators({
  certified,
  fresh,
  healthy,
}: {
  certified: boolean;
  fresh: boolean;
  healthy: boolean;
}) {
  const items = [
    ["Certified", certified],
    ["Fresh", fresh],
    ["Healthy", healthy],
  ] as const;
  return (
    <ul className="mt-4 flex flex-wrap gap-2" data-testid="trust-indicators">
      {items.map(([label, ok]) => (
        <li
          key={label}
          className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${
            ok
              ? "border-[#d2e8dc] bg-[#eaf5ef] text-[#2f7659]"
              : "border-[#efd4d4] bg-[#fbeeee] text-[#934646]"
          }`}
        >
          {label}
        </li>
      ))}
    </ul>
  );
}
