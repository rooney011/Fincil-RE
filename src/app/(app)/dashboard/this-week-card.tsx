import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { WeekSummary } from "@/lib/insights/weekly";

export function ThisWeekCard({ summary }: { summary: WeekSummary }) {
  const weekStart = new Date(summary.weekStartsOn);
  const weekLabel = weekStart.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">This week</h2>
          <span className="text-xs text-muted-foreground">
            (since {weekLabel})
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label="Spent"
            value={formatCurrency(summary.totalSpend)}
          />
          <Stat
            label="Top category"
            value={
              summary.topCategory
                ? `${summary.topCategory.category}`
                : "—"
            }
            sub={
              summary.topCategory
                ? formatCurrency(summary.topCategory.spend)
                : undefined
            }
            capitalize
          />
          <Stat
            label="Biggest expense"
            value={
              summary.biggestExpense
                ? formatCurrency(summary.biggestExpense.amount)
                : "—"
            }
            sub={summary.biggestExpense?.description}
          />
          <Stat
            label="Goals on track"
            value={
              summary.goalsTotal === 0
                ? "—"
                : `${summary.goalsOnTrack}/${summary.goalsTotal}`
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  capitalize,
}: {
  label: string;
  value: string;
  sub?: string;
  capitalize?: boolean;
}) {
  return (
    <div className="space-y-0.5 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`font-mono text-sm font-medium tabular-nums truncate ${capitalize ? "capitalize" : ""}`}
        title={value}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-muted-foreground truncate" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}
