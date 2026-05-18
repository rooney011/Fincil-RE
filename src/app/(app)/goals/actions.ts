"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PRIORITIES = ["low", "medium", "high"] as const;
const STATUSES = ["active", "done"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  target_amount: z.number().positive().max(1_000_000_000),
  current_amount: z.number().min(0).max(1_000_000_000).default(0),
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .optional()
    .or(z.literal("")),
  priority: z.enum(PRIORITIES).default("medium"),
});

export type CreateGoalInput = z.input<typeof createSchema>;

export async function createGoal(
  input: CreateGoalInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Some fields look off. Please review and retry." };
  }
  if (parsed.data.current_amount > parsed.data.target_amount) {
    return {
      error: "Current amount can't exceed the target. Lower one or raise the other.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("savings_goals").insert({
    user_id: user.id,
    name: parsed.data.name,
    target_amount: parsed.data.target_amount,
    current_amount: parsed.data.current_amount,
    target_date: parsed.data.target_date || null,
    priority: parsed.data.priority,
    status: "active",
  });

  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return { ok: true };
}

const contributeSchema = z.object({
  id: z.uuid(),
  delta: z.number().refine((n) => n !== 0, "Amount can't be zero"),
});

export async function contributeToGoal(
  input: z.input<typeof contributeSchema>,
): Promise<{ ok: true; newCurrent: number; achieved: boolean } | { error: string }> {
  const parsed = contributeSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Read current to compute new value + guard against negatives.
  const { data: row, error: readError } = await supabase
    .from("savings_goals")
    .select("current_amount, target_amount, status")
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError || !row) return { error: "Goal not found." };

  const newCurrent = Math.max(
    0,
    Number(row.current_amount) + parsed.data.delta,
  );
  const target = Number(row.target_amount);
  const achieved =
    newCurrent >= target && row.status !== "done";

  const { error: updError } = await supabase
    .from("savings_goals")
    .update({
      current_amount: newCurrent,
      ...(achieved ? { status: "done" } : {}),
    })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);
  if (updError) return { error: updError.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return { ok: true, newCurrent, achieved };
}

const setStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(STATUSES),
});

export async function setGoalStatus(
  input: z.input<typeof setStatusSchema>,
): Promise<{ ok: true } | { error: string }> {
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("savings_goals")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteGoal(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  if (typeof id !== "string" || !id) return { error: "Invalid id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("savings_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return { ok: true };
}
