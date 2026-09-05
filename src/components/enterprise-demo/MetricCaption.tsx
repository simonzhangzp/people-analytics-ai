export function MetricCaption({
  scope,
  window,
  asOf,
}: {
  scope: string;
  window: string;
  asOf: string;
}) {
  return (
    <p className="mt-1 text-[11px] font-medium tracking-[0.04em] text-[#738097]" data-testid="metric-grain">
      Scope {scope} · Window {window} · as_of {asOf || "—"}
    </p>
  );
}
