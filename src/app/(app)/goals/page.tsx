import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { GoalCard } from "./goal-card";
import { AddGoalDialog } from "./add-goal-dialog";
import type { Goal } from "./constants";

function daysLeftFor(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const ms = new Date(targetDate).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default async function GoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data, error } = await supabase
    .from("savings_goals")
    .select(
      "id, name, target_amount, current_amount, target_date, priority, status, created_at",
    )
    .eq("user_id", user.id)
    .order("status", { ascending: true }) // active before others alphabetically; further refined below
    .order("created_at", { ascending: false });

  const goals: Goal[] = (data ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    target_amount: Number(g.target_amount),
    current_amount: Number(g.current_amount),
    target_date: (g.target_date as string | null) ?? null,
    priority: g.priority as Goal["priority"],
    status: g.status as Goal["status"],
    created_at: g.created_at as string,
  }));

  // Order: active first, then paused, then achieved, then abandoned.
  const statusOrder: Record<Goal["status"], number> = {
    active: 0,
    paused: 1,
    achieved: 2,
    abandoned: 3,
  };
  goals.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return (
    <>
      <PageHeader
        title="Savings Goals"
        description="Set targets. The Council weighs every purchase against them."
        action={<AddGoalDialog />}
      />

      {goals.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {error
              ? `Error loading goals: ${error.message}`
              : 'No goals yet. Click "Add goal" to set one.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              daysLeft={daysLeftFor(g.target_date)}
            />
          ))}
        </div>
      )}
    </>
  );
}
