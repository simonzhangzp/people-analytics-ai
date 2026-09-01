export function TrendSparkline({
  points,
}: {
  points: Array<{ as_of: string; value: number }>;
}) {
  const values = points.map((point) => point.value).filter((value) => Number.isFinite(value));
  const max = values.length ? Math.max(...values, 0.01) : 0.01;

  return (
    <div className="flex h-40 items-end gap-1" data-testid="attrition-trend">
      {points.map((point) => {
                const height = Number.isFinite(point.value) ? (point.value / max) * 100 : 0;
        return (
          <div key={point.as_of} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-[3px] bg-[#3559c7]"
              style={{ height: `${Math.max(height, 6)}%` }}
              title={`${point.as_of}: ${(point.value * 100).toFixed(1)}%`}
            />
          </div>
        );
      })}
    </div>
  );
}
