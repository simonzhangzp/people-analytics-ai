import { CASE3_SCENARIO_START, trendChartModel } from "@/lib/people/case3-view";

export function TrendSparkline({
  points,
}: {
  points: Array<{ as_of: string; value: number }>;
}) {
  const model = trendChartModel(points);
  if (model.status === "error") {
    return (
      <div
        className="flex min-h-40 items-center border border-[#efd4d4] bg-[#fbeeee] px-4 py-6 text-[13px] leading-6 text-[#934646]"
        data-testid="attrition-trend"
        data-empty="true"
        role="alert"
      >
        {model.message}
      </div>
    );
  }

  const values = model.points.map((point) => point.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const pad = Math.max((dataMax - dataMin) * 0.2, 0.005);
  const yMin = Math.max(0, dataMin - pad);
  const yMax = dataMax + pad;
  const truncated = yMin > 0.0005;
  const width = 640;
  const height = 168;
  const left = 46;
  const right = 10;
  const top = 10;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const n = model.points.length;
  const yAt = (value: number) => top + ((yMax - value) / (yMax - yMin || 1)) * plotH;
  const xAt = (index: number) => left + (n <= 1 ? plotW / 2 : (index / (n - 1)) * plotW);
  const ticks = [yMin, yMin + (yMax - yMin) / 2, yMax];
  const scenarioIndex = model.points.findIndex((point) => point.as_of.startsWith(CASE3_SCENARIO_START));
  const first = model.points[0];
  const last = model.points[model.points.length - 1];
  const barWidth = Math.max(4, (plotW / Math.max(n, 1)) * 0.72);

  return (
    <div data-testid="attrition-trend" data-empty="false">
      <p className="text-[12px] text-[#546277]">
        Engineering voluntary attrition · trailing-12m annualized · {model.points.length} months
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 w-full"
        role="img"
        aria-label="Engineering trailing-12m voluntary attrition, last 24 months, with 2026-03 scenario start marked"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={left + plotW}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke="#e3e7ed"
              strokeWidth="1"
            />
            <text
              x={left - 6}
              y={yAt(tick) + 3}
              textAnchor="end"
              className="fill-[#667085]"
              fontSize="11"
            >
              {(tick * 100).toFixed(1)}%
            </text>
          </g>
        ))}
        <desc data-testid="attrition-trend-ticks">
          {ticks.map((tick) => (tick * 100).toFixed(1)).join(",")}
        </desc>
        {scenarioIndex >= 0 ? (
          <g>
            <line
              x1={xAt(scenarioIndex)}
              x2={xAt(scenarioIndex)}
              y1={top}
              y2={top + plotH}
              stroke="#8a571c"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
            <text
              x={Math.min(xAt(scenarioIndex) + 4, left + plotW - 8)}
              y={top + 11}
              className="fill-[#8a571c]"
              fontSize="11"
              fontWeight="600"
            >
              {CASE3_SCENARIO_START} scenario start
            </text>
          </g>
        ) : null}
        {model.points.map((point, index) => {
          const x = xAt(index) - barWidth / 2;
          const y = yAt(point.value);
          const isScenario = point.as_of.startsWith(CASE3_SCENARIO_START);
          return (
            <rect
              key={point.as_of}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(1, top + plotH - y)}
              rx="2"
              fill={isScenario ? "#8a571c" : "#3559c7"}
              data-testid="attrition-trend-point"
              data-as-of={point.as_of}
              data-scenario={isScenario ? "true" : "false"}
            >
              <title>{`${point.as_of}: ${(point.value * 100).toFixed(1)}%`}</title>
            </rect>
          );
        })}
        <text x={left} y={height - 6} className="fill-[#667085]" fontSize="11">
          {first?.as_of?.slice(0, 7)}
        </text>
        <text x={left + plotW} y={height - 6} textAnchor="end" className="fill-[#667085]" fontSize="11">
          {last?.as_of?.slice(0, 7)}
        </text>
      </svg>
      {truncated ? (
        <p className="mt-1 text-[11px] text-[#667085]" data-testid="attrition-trend-axis-note">
          Y-axis starts at {(yMin * 100).toFixed(1)}%, not 0. Unit: trailing-12m annualized rate.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-[#667085]">Unit: trailing-12m annualized rate.</p>
      )}
      {!model.scenarioAsOf ? (
        <p data-testid="attrition-trend-scenario" className="mt-1 text-[11px] text-[#934646]">
          {CASE3_SCENARIO_START} scenario start is not in this series
        </p>
      ) : (
        <p data-testid="attrition-trend-scenario" className="mt-1 text-[11px] font-semibold text-[#8a571c]">
          Vertical marker: {CASE3_SCENARIO_START} scenario start
        </p>
      )}
    </div>
  );
}
