import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "./settings-form";
import type { UpdateProfileInput } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: row, error } = await supabase
    .from("profiles")
    .select(
      "display_name, role, monthly_income, monthly_expenses, income_type, risk_tolerance, financial_goal",
    )
    .eq("id", user.id)
    .single();

  if (error || !row) redirect("/onboarding");

  const initial: UpdateProfileInput = {
    display_name: (row.display_name as string | null) ?? "",
    role: row.role as UpdateProfileInput["role"],
    monthly_income: Number(row.monthly_income),
    monthly_expenses: Number(row.monthly_expenses),
    income_type: row.income_type as UpdateProfileInput["income_type"],
    risk_tolerance: row.risk_tolerance as UpdateProfileInput["risk_tolerance"],
    financial_goal: (row.financial_goal as string | null) ?? "",
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Edit your profile. The Council uses this every time you ask."
      />
      <SettingsForm initial={initial} />
    </>
  );
}
