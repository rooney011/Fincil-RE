import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gavel, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cn, formatCurrency } from "@/lib/utils";
import {
  type Goal,
  PRIORITY_TONE,
} from "../goals/constants";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: goalsData } = await supabase
    .from("savings_goals")
    .select(
      "id, name, target_amount, current_amount, target_date, priority, status, created_at",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(3);

  const activeGoals: Goal[] = (goalsData ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    target_amount: Number(g.target_amount),
    current_amount: Number(g.current_amount),
    target_date: (g.target_date as string | null) ?? null,
    priority: g.priority as Goal["priority"],
    status: g.status as Goal["status"],
    created_at: g.created_at as string,
  }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your financial command center."
        action={
          <Link href="/council" className={buttonVariants()}>
            <Gavel className="size-4" />
            Consult the Council
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Surplus this month", value: "—" },
          { label: "Goals on track", value: "—" },
          { label: "Council decisions", value: "—" },
          { label: "Top category", value: "—" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {kpi.label}
              </p>
              <p className="text-2xl font-mono font-semibold mt-2 tabular-nums">
                {kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Goals at a glance</h2>
          </div>
          <Link
            href="/goals"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all →
          </Link>
        </div>

        {activeGoals.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No active goals yet.{" "}
              <Link
                href="/goals"
                className="text-foreground hover:underline underline-offset-4"
              >
                Set one
              </Link>{" "}
              and the Council will weigh purchases against it.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activeGoals.map((g) => {
              const progress =
                g.target_amount > 0
                  ? Math.min(100, (g.current_amount / g.target_amount) * 100)
                  : 0;
              const remaining = Math.max(
                0,
                g.target_amount - g.current_amount,
              );
              return (
                <Card key={g.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium truncate">{g.name}</h3>
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize text-[10px]",
                          PRIORITY_TONE[g.priority],
                        )}
                      >
                        {g.priority}
                      </Badge>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {formatCurrency(g.current_amount)} /{" "}
                        {formatCurrency(g.target_amount)}
                      </span>
                      <span className="text-muted-foreground">
                        {Math.round(progress)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {formatCurrency(remaining)} to go
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card className="mt-8">
        <CardContent className="p-10 text-center">
          <p className="text-muted-foreground text-sm">
            Empty state — KPIs and recent debates will appear here once you log
            a few transactions and consult the Council.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
