import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import {
  CategoryPie,
  TrendLine,
  type CategoryDatum,
  type TrendDatum,
} from "./analysis-charts";
import { AskBox } from "./ask-box";

const RANGES = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "all", label: "All" },
] as const;

type Range = (typeof RANGES)[number]["value"];

function normalizeRange(input: string | undefined): Range {
  return (RANGES.find((r) => r.value === input)?.value ?? "30") as Range;
}

type RawTx = {
  amount: number;
  category: string;
  occurred_at: string;
};

function rangeToDays(range: Range): number | null {
  return range === "all" ? null : Number.parseInt(range, 10);
}

function binForRange(rangeDays: number | null): "daily" | "weekly" | "monthly" {
  if (rangeDays === null) return "monthly";
  if (rangeDays <= 7) return "daily";
  if (rangeDays <= 60) return "weekly";
  return "monthly";
}

function periodKey(
  date: Date,
  bin: "daily" | "weekly" | "monthly",
): string {
  if (bin === "daily") return date.toISOString().slice(0, 10);
  if (bin === "weekly") {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // floor to Sunday
    return d.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 7); // YYYY-MM
}

function periodLabel(
  key: string,
  bin: "daily" | "weekly" | "monthly",
): string {
  if (bin === "monthly") {
    const [y, m] = key.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
    });
  }
  const d = new Date(key);
  if (bin === "weekly") {
    return `Wk of ${d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`;
  }
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function aggregate(txs: RawTx[], bin: "daily" | "weekly" | "monthly") {
  const outflows = txs.filter((t) => t.amount < 0);

  let totalSpent = 0;
  const categoryMap = new Map<string, number>();
  const periodMap = new Map<string, number>();
  let biggest: RawTx | null = null;

  for (const t of outflows) {
    const abs = Math.abs(t.amount);
    totalSpent += abs;
    categoryMap.set(t.category, (categoryMap.get(t.category) ?? 0) + abs);
    const key = periodKey(new Date(t.occurred_at), bin);
    periodMap.set(key, (periodMap.get(key) ?? 0) + abs);
    if (!biggest || abs > Math.abs(biggest.amount)) biggest = t;
  }

  const categories: CategoryDatum[] = [...categoryMap.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const trend: TrendDatum[] = [...periodMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, total]) => ({ period: periodLabel(period, bin), total }));

  const topCategory = categories[0]?.category ?? null;

  return {
    totalSpent,
    biggest,
    topCategory,
    categories,
    trend,
  };
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function daysSpanned(txs: RawTx[]): number {
  if (txs.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const t of txs) {
    const ts = new Date(t.occurred_at).getTime();
    if (ts < min) min = ts;
    if (ts > max) max = ts;
  }
  return Math.max(1, Math.ceil((max - min) / (1000 * 60 * 60 * 24)) + 1);
}

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = normalizeRange(sp.range);
  const rangeDays = rangeToDays(range);
  const bin = binForRange(rangeDays);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  let query = supabase
    .from("transactions")
    .select("amount, category, occurred_at")
    .eq("user_id", user.id);
  if (rangeDays !== null) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - rangeDays);
    query = query.gte("occurred_at", fromDate.toISOString());
  }

  const { data, error } = await query;
  const txs: RawTx[] = (data ?? []).map((r) => ({
    amount: Number(r.amount),
    category: String(r.category),
    occurred_at: String(r.occurred_at),
  }));

  const { totalSpent, biggest, topCategory, categories, trend } = aggregate(
    txs,
    bin,
  );

  const denominatorDays = rangeDays ?? Math.max(1, daysSpanned(txs));
  const dailyAvg = denominatorDays > 0 ? totalSpent / denominatorDays : 0;

  const kpis = [
    { label: "Total spent", value: formatCurrency(totalSpent) },
    { label: "Daily avg", value: formatCurrency(dailyAvg) },
    {
      label: "Top category",
      value: topCategory ? capitalize(topCategory) : "—",
    },
    {
      label: "Biggest expense",
      value: biggest ? formatCurrency(Math.abs(biggest.amount)) : "—",
      sub: biggest ? biggest.category : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Analysis"
        description="Where the money goes — and what the Council can answer about it."
      />

      <div className="flex items-center gap-1 mb-5">
        {RANGES.map((r) => (
          <Link
            key={r.value}
            href={r.value === "30" ? "/analysis" : `/analysis?range=${r.value}`}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors",
              range === r.value
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {k.label}
              </p>
              <p className="text-2xl font-mono font-semibold mt-2 tabular-nums">
                {k.value}
              </p>
              {k.sub && (
                <p className="text-xs text-muted-foreground mt-1 capitalize">
                  {k.sub}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {error ? (
        <Card className="mt-6">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Error loading transactions: {error.message}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <CategoryPie data={categories} />
          <TrendLine data={trend} binLabel={bin} />
        </div>
      )}

      <div className="mt-6">
        <AskBox />
      </div>
    </>
  );
}
