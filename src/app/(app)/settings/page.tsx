import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/page-header";
import { expireMaturedCommitments } from "@/lib/finance/emi-commitments";
import { SettingsForm } from "./settings-form";
import { DemoDataControls } from "./demo-data-controls";
import {
  RecurringExpensesControls,
  type ActiveCommitment,
} from "./recurring-expenses-controls";
import type { UpdateProfileInput } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Decay any matured commitments so what we render below is always fresh.
  await expireMaturedCommitments(supabase, user.id);

  const { data: row, error } = await supabase
    .from("profiles")
    .select(
      "display_name, role, monthly_income, monthly_expenses, baseline_monthly_expenses, risk_tolerance, financial_goal",
    )
    .eq("id", user.id)
    .single();

  if (error || !row) redirect("/onboarding");

  const [
    { count: totalTransactions },
    { count: demoTransactions },
    { data: commitmentsData },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_demo", true),
    supabase
      .from("emi_commitments")
      .select("id, monthly_amount, started_at, expires_at")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("started_at", { ascending: false }),
  ]);

  const baseline = Number(row.baseline_monthly_expenses ?? 0);
  const cachedTotal = Number(row.monthly_expenses);
  const commitments: ActiveCommitment[] = (commitmentsData ?? []).map((c) => ({
    id: c.id as string,
    monthly_amount: Number(c.monthly_amount),
    started_at: c.started_at as string,
    expires_at: c.expires_at as string,
  }));
  const activeCommitmentsTotal = commitments.reduce(
    (s, c) => s + c.monthly_amount,
    0,
  );

  const initial: UpdateProfileInput = {
    display_name: (row.display_name as string | null) ?? "",
    role: row.role as UpdateProfileInput["role"],
    monthly_income: Number(row.monthly_income),
    baseline_monthly_expenses: baseline,
    risk_tolerance: row.risk_tolerance as UpdateProfileInput["risk_tolerance"],
    financial_goal: (row.financial_goal as string | null) ?? "",
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Edit your profile. The Council uses this every time you ask."
      />
      <div className="space-y-6">
        <SettingsForm
          initial={initial}
          activeCommitmentsTotal={activeCommitmentsTotal}
          activeCommitmentsCount={commitments.length}
        />
        <RecurringExpensesControls
          baseline={baseline}
          cachedTotal={cachedTotal}
          commitments={commitments}
        />
        <DemoDataControls
          totalTransactions={totalTransactions ?? 0}
          demoTransactions={demoTransactions ?? 0}
        />
      </div>
    </>
  );
}
