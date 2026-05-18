"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  display_name: z.string().trim().min(1).max(50),
  role: z.enum(["student", "freelancer", "employee", "business", "general"]),
  monthly_income: z.number().min(0).max(1_000_000_000),
  monthly_expenses: z.number().min(0).max(1_000_000_000),
  financial_goal: z.string().trim().max(500),
  risk_tolerance: z.enum(["low", "medium", "high"]),
});

export type OnboardingInput = z.input<typeof schema>;

export async function completeOnboarding(
  input: OnboardingInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: "Some fields look off. Please review and try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You're not signed in." };

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    display_name: parsed.data.display_name,
    role: parsed.data.role,
    monthly_income: parsed.data.monthly_income,
    monthly_expenses: parsed.data.monthly_expenses,
    income_type: "fixed",
    risk_tolerance: parsed.data.risk_tolerance,
    financial_goal: parsed.data.financial_goal || null,
  });

  if (error && error.code !== "23505") {
    // 23505 = duplicate — already inserted (race with another tab). Treat as ok
    // and let the client advance to the "Choose start" step.
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
