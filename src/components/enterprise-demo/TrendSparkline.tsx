"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function TrendSparkline({
  points,
}: {
  points: Array<{ as_of: string; value: number }>;
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height={192}>
        <LineChart data={points}>
          <CartesianGrid stroke="#eef0f4" />
          <XAxis dataKey="as_of" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#3559c7" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
