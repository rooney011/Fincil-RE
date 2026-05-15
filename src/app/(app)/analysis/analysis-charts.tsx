"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

// Hex palette mirrors transactions/transactions-list.tsx category tones.
const CATEGORY_HEX: Record<string, string> = {
  food: "#fbbf24",
  transport: "#38bdf8",
  shopping: "#f472b6",
  bills: "#ef4444",
  entertainment: "#a78bfa",
  health: "#fb7185",
  education: "#34d399",
  travel: "#22d3ee",
  subscription: "#e879f9",
  salary: "#34d399",
  gift: "#facc15",
  refund: "#2dd4bf",
  other: "#a1a1aa",
};

export type CategoryDatum = { category: string; total: number };
export type TrendDatum = { period: string; total: number };

export function CategoryPie({ data }: { data: CategoryDatum[] }) {
  if (data.length === 0) {
    return <EmptyPanel label="No outflows in this range to break down." />;
  }
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-sm font-medium mb-3">Category breakdown</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="total"
                nameKey="category"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                stroke="rgba(0,0,0,0.2)"
              >
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={CATEGORY_HEX[entry.category] ?? CATEGORY_HEX.other}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgb(24 24 27 / 0.95)",
                  border: "1px solid rgb(63 63 70)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  String(name).replace(/^./, (c) => c.toUpperCase()),
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) =>
                  String(value).replace(/^./, (c) => c.toUpperCase())
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function TrendLine({
  data,
  binLabel,
}: {
  data: TrendDatum[];
  binLabel: "daily" | "weekly" | "monthly";
}) {
  if (data.length === 0) {
    return <EmptyPanel label="No outflows in this range to trend." />;
  }
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-sm font-medium mb-3 capitalize">
          {binLabel} spending trend
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="period"
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgb(24 24 27 / 0.95)",
                  border: "1px solid rgb(63 63 70)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => [formatCurrency(Number(value)), "Spent"]}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: "#10b981" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">
        {label}
      </CardContent>
    </Card>
  );
}
