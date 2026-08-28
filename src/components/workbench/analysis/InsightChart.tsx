"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InsightChartSpec } from "@/types/workbench";

const PRIMARY = "#365fc7";
const SECONDARY = "#9eb0df";
const GRID = "#e5e8ed";

export function InsightChart({ spec }: { spec: InsightChartSpec }) {
  const formatValue = (value: number) => {
    if (spec.unit === "percent") return `${value.toFixed(1)}%`;
    if (spec.unit === "percentage points") return `${value.toFixed(1)}pp`;
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
  };

  const commonAxis = {
    tick: { fill: "#6d7788", fontSize: 10 },
    axisLine: { stroke: GRID },
    tickLine: false,
  };

  if (spec.kind === "line") {
    return (
      <div className="h-[250px] w-full" aria-label={spec.title}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spec.data} margin={{ top: 15, right: 18, bottom: 5, left: 4 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...commonAxis} />
            <YAxis {...commonAxis} tickFormatter={formatValue} width={44} />
            <Tooltip
              formatter={(value) => formatValue(Number(value))}
              contentStyle={{
                border: "1px solid #dfe3e9",
                borderRadius: 6,
                fontSize: 11,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line
              name="Selected period"
              dataKey="value"
              type="monotone"
              stroke={PRIMARY}
              strokeWidth={2}
              dot={{ r: 3, fill: PRIMARY }}
            />
            {spec.data.some((row) => row.secondaryValue !== undefined) && (
              <Line
                name="Comparison"
                dataKey="secondaryValue"
                type="monotone"
                stroke={SECONDARY}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 3, fill: SECONDARY }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (spec.kind === "scatter") {
    return (
      <div className="h-[250px] w-full" aria-label={spec.title}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 15, right: 18, bottom: 5, left: 4 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis type="number" dataKey="value" {...commonAxis} />
            <YAxis
              type="number"
              dataKey="secondaryValue"
              {...commonAxis}
              tickFormatter={formatValue}
              width={44}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{
                border: "1px solid #dfe3e9",
                borderRadius: 6,
                fontSize: 11,
              }}
            />
            <Scatter data={spec.data} fill={PRIMARY} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-[250px] w-full" aria-label={spec.title}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={spec.data}
          margin={{ top: 15, right: 18, bottom: 5, left: 4 }}
          layout={spec.kind === "stacked-bar" ? "vertical" : "horizontal"}
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          {spec.kind === "stacked-bar" ? (
            <>
              <XAxis type="number" {...commonAxis} tickFormatter={formatValue} />
              <YAxis dataKey="label" type="category" {...commonAxis} width={88} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" {...commonAxis} />
              <YAxis {...commonAxis} tickFormatter={formatValue} width={44} />
            </>
          )}
          <Tooltip
            formatter={(value) => formatValue(Number(value))}
            contentStyle={{
              border: "1px solid #dfe3e9",
              borderRadius: 6,
              fontSize: 11,
            }}
          />
          <Bar dataKey="value" fill={PRIMARY} radius={[3, 3, 0, 0]}>
            {spec.data.map((entry, index) => (
              <Cell
                key={`${entry.label}-${index}`}
                fill={index === 0 ? PRIMARY : "#8299d4"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

