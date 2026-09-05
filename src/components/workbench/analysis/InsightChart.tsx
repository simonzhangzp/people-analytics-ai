"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartAssemblyInput } from "flint-chart";
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
  const [failed, setFailed] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const flintInput = useMemo(() => toFlintInput(spec), [spec]);

  useEffect(() => {
    let disposed = false;
    let finalize: (() => void) | undefined;
    void Promise.all([
      import("flint-chart/vegalite"),
      import("vega-embed"),
    ])
      .then(async ([flint, vega]) => {
        if (disposed || !hostRef.current || !flintInput) return;
        const compiled = flint.assembleVegaLite(flintInput) as Record<
          string,
          unknown
        >;
        compiled.background = "transparent";
        compiled.config = {
          ...(typeof compiled.config === "object" && compiled.config
            ? compiled.config
            : {}),
          font: "var(--font-sans)",
          view: { stroke: null },
          range: {
            category: [
              PRIMARY,
              "#8299d4",
              "#9eb0df",
              "#5d79c9",
              "#b8c4e3",
            ],
          },
        };
        const result = await vega.default(hostRef.current, compiled, {
          actions: false,
          renderer: "svg",
        });
        finalize = () => result.finalize();
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      finalize?.();
    };
  }, [flintInput]);

  if (!flintInput || failed) return <RechartsFallback spec={spec} />;

  return (
    <div
      ref={hostRef}
      className="min-h-[250px] w-full overflow-x-auto"
      role="img"
      aria-label={spec.title}
      data-chart-engine="flint"
    />
  );
}

function toFlintInput(spec: InsightChartSpec): ChartAssemblyInput | null {
  if (spec.kind === "table" || spec.data.length === 0) return null;
  if (spec.kind === "scatter") {
    return {
      data: {
        values: spec.data.map((row) => ({
          x: row.value,
          y: row.secondaryValue ?? 0,
          label: row.label,
        })),
      },
      semantic_types: { x: "Quantity", y: "Quantity", label: "Category" },
      chart_spec: {
        chartType: "Scatter Plot",
        title: spec.title,
        encodings: {
          x: { field: "x" },
          y: { field: "y" },
          detail: { field: "label" },
        },
        baseSize: { width: 560, height: 250 },
        canvasSize: { width: 820, height: 340 },
      },
      theme_spec: "swiss",
      options: { addTooltips: true, maxColorValues: 12 },
    };
  }

  const hasComparison = spec.data.some(
    (row) => row.secondaryValue !== undefined,
  );
  const hasSeries = spec.data.some((row) => Boolean(row.group));
  const values = hasComparison
    ? spec.data.flatMap((row) => [
        { category: row.label, value: row.value, series: "Selected period" },
        {
          category: row.label,
          value: row.secondaryValue ?? 0,
          series: "Comparison",
        },
      ])
    : spec.data.map((row) => ({
        category: row.label,
        value: row.value,
        series: row.group,
      }));
  const categorySemantic =
    /country/i.test(spec.xLabel ?? spec.title)
      ? "Country"
      : spec.kind === "line"
        ? "YearMonth"
        : "Category";
  const valueSemantic =
    spec.unit === "percent"
      ? "Percentage"
      : spec.unit === "days"
        ? "Duration"
        : "Quantity";
  return {
    data: { values },
    semantic_types: {
      category: categorySemantic,
      value: valueSemantic,
      ...(hasComparison || hasSeries ? { series: "Category" } : {}),
    },
    field_display_names: {
      category: spec.xLabel ?? "Category",
      value: spec.yLabel ?? "Value",
    },
    chart_spec: {
      chartType:
        spec.kind === "line"
          ? "Line Chart"
          : spec.kind === "stacked-bar"
            ? "Stacked Bar Chart"
            : "Bar Chart",
      title: spec.title,
      encodings: {
        x: { field: "category" },
        y: { field: "value" },
        ...(hasComparison || hasSeries ? { color: { field: "series" } } : {}),
      },
      baseSize: { width: 560, height: 250 },
      canvasSize: { width: 820, height: 340 },
    },
    theme_spec: "swiss",
    options: {
      addTooltips: true,
      maxColorValues: 12,
      baseLabelFontSize: 11,
      baseTitleFontSize: 12,
    },
  };
}

function RechartsFallback({ spec }: { spec: InsightChartSpec }) {
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
    const groupedSeries = [
      ...new Set(spec.data.flatMap((row) => (row.group ? [row.group] : []))),
    ];
    const lineData =
      groupedSeries.length > 0
        ? [...new Set(spec.data.map((row) => row.label))].map((label) => ({
            label,
            ...Object.fromEntries(
              spec.data
                .filter((row) => row.label === label && row.group)
                .map((row) => [row.group!, row.value]),
            ),
          }))
        : spec.data;
    const seriesColors = [PRIMARY, "#8299d4", "#9eb0df", "#5d79c9", "#b8c4e3"];
    return (
      <div className="h-[250px] w-full" aria-label={spec.title}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lineData} margin={{ top: 15, right: 18, bottom: 5, left: 4 }}>
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
            {groupedSeries.length > 0 ? (
              groupedSeries.map((series, index) => (
                <Line
                  key={series}
                  name={series}
                  dataKey={series}
                  type="monotone"
                  stroke={seriesColors[index % seriesColors.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              ))
            ) : (
              <>
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
              </>
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

