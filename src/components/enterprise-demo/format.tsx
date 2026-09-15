"use client";

import { Badge } from "@/components/ui/badge";

export function QualityBadge({ status }: { status?: string | null }) {
  if (status === "unhealthy" || status === "blocked" || status === "degraded") {
    return (
      <Badge variant="danger" data-testid="quality-unhealthy">
        {status === "blocked" ? "Blocked" : status === "degraded" ? "Degraded" : "Not trusted"}
      </Badge>
    );
  }
  if (status === "withheld" || status === "error") {
    return (
      <Badge variant="danger" data-testid="quality-unhealthy">
        {status === "withheld" ? "Withheld" : "Serving error"}
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
              ? "border-certified-line bg-certified-soft text-certified-dark"
              : "border-danger-line bg-danger-soft text-danger"
          }`}
        >
          {label}
        </li>
      ))}
    </ul>
  );
}
