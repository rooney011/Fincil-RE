"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  expireMaturedCommitments,
  recalculateMonthlyExpenses,
} from "@/lib/finance/emi-commitments";

const schema = z.object({
  display_name: z.string().trim().min(1).max(50),
  role: z.enum(["student", "freelancer", "employee", "business", "general"]),
  monthly_income: z.number().min(0).max(1_000_000_000),
  // Edited as the user-facing baseline figure. The cached monthly_expenses
  // (= baseline + active EMI commitments) is recomputed server-side on save.
  baseline_monthly_expenses: z.number().min(0).max(1_000_000_000),
  financial_goal: z.string().trim().max(500),
  risk_tolerance: z.enum(["low", "medium", "high"]),
});

export type UpdateProfileInput = z.input<typeof schema>;

export async function updateProfile(
  input: UpdateProfileInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: "Some fields look off. Please review and retry." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Save the user-facing fields. monthly_expenses stays whatever it was so
  // the next recalc step writes the canonical cached total.
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.display_name,
      role: parsed.data.role,
      monthly_income: parsed.data.monthly_income,
      baseline_monthly_expenses: parsed.data.baseline_monthly_expenses,
      risk_tolerance: parsed.data.risk_tolerance,
      financial_goal: parsed.data.financial_goal || null,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  // Cached total stays consistent with the new baseline + currently active
  // commitments (after a defensive expiry pass).
  const recalc = await recalculateMonthlyExpenses(supabase, user.id);
  if ("error" in recalc) return { error: recalc.error };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function recalculateExpenses(): Promise<
  | { ok: true; baseline: number; active: number; total: number }
  | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  await expireMaturedCommitments(supabase, user.id);
  const result = await recalculateMonthlyExpenses(supabase, user.id);
  if ("error" in result) return { error: result.error };

  revalidatePath("/", "layout");
  return result;
}
