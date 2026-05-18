import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const EMI_TERM_MONTHS = 12;

/**
 * Lazily decay EMI commitments whose 12-month window has passed.
 *
 * Called at the top of every code path that consults the user's finance
 * picture (debate, appeal, decide). For each active commitment past its
 * `expires_at`, we mark it inactive and subtract its monthly contribution
 * from `profiles.monthly_expenses`.
 *
 * This is cheaper than a cron — most calls find nothing to expire. Returns
 * the total amount removed so callers can log / surface it if useful.
 */
export async function expireMaturedCommitments(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ removed: number; count: number }> {
  const { data: expired } = await supabase
    .from("emi_commitments")
    .select("id, monthly_amount")
    .eq("user_id", userId)
    .eq("active", true)
    .lte("expires_at", new Date().toISOString().slice(0, 10));

  if (!expired || expired.length === 0) return { removed: 0, count: 0 };

  const totalToRemove = expired.reduce(
    (sum, row) => sum + Number(row.monthly_amount),
    0,
  );
  const ids = expired.map((row) => row.id as string);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("monthly_expenses, baseline_monthly_expenses")
    .eq("id", userId)
    .single();
  if (!profileRow) return { removed: 0, count: 0 };

  // Floor at baseline so we never decay below the user-entered figure even
  // if some bookkeeping drifted (e.g. a manual settings edit lowered expenses
  // between the bump and the expiry).
  const baseline = Number(profileRow.baseline_monthly_expenses ?? 0);
  const current = Number(profileRow.monthly_expenses);
  const newExpenses = Math.max(baseline, current - totalToRemove);

  const updates = await Promise.all([
    supabase
      .from("emi_commitments")
      .update({ active: false })
      .in("id", ids)
      .eq("user_id", userId),
    supabase
      .from("profiles")
      .update({ monthly_expenses: newExpenses })
      .eq("id", userId),
  ]);

  for (const r of updates) {
    if (r.error) {
      console.warn("[emi-commitments] decay update failed:", r.error);
    }
  }

  return { removed: totalToRemove, count: expired.length };
}

/**
 * Insert a new commitment row for a freshly-accepted EMI. The caller is
 * still responsible for bumping `profiles.monthly_expenses` — this row is
 * the audit trail and the source-of-truth for the lazy expiry pass.
 */
export async function recordCommitment(
  supabase: SupabaseClient,
  args: {
    userId: string;
    sessionId: string;
    monthlyAmount: number;
  },
): Promise<{ ok: true } | { error: string }> {
  const startedAt = new Date();
  const expiresAt = new Date(startedAt);
  expiresAt.setMonth(expiresAt.getMonth() + EMI_TERM_MONTHS);

  const { error } = await supabase.from("emi_commitments").insert({
    user_id: args.userId,
    session_id: args.sessionId,
    monthly_amount: args.monthlyAmount,
    started_at: startedAt.toISOString().slice(0, 10),
    expires_at: expiresAt.toISOString().slice(0, 10),
    active: true,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Recalculate `profiles.monthly_expenses = baseline + sum(active commitments)`.
 * Runs an expiry pass first so any matured EMIs are decayed before we sum.
 *
 * Used by the Settings "Recalculate recurring expenses" button to recover
 * from any historical drift (e.g. manual edits, partial inserts).
 */
export async function recalculateMonthlyExpenses(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; baseline: number; active: number; total: number } | { error: string }> {
  await expireMaturedCommitments(supabase, userId);

  const { data: profileRow, error: profileErr } = await supabase
    .from("profiles")
    .select("baseline_monthly_expenses")
    .eq("id", userId)
    .single();
  if (profileErr || !profileRow) {
    return { error: profileErr?.message ?? "Profile not found." };
  }
  const baseline = Number(profileRow.baseline_monthly_expenses ?? 0);

  const { data: active, error: emisErr } = await supabase
    .from("emi_commitments")
    .select("monthly_amount")
    .eq("user_id", userId)
    .eq("active", true);
  if (emisErr) return { error: emisErr.message };

  const activeSum = (active ?? []).reduce(
    (sum, row) => sum + Number(row.monthly_amount),
    0,
  );
  const total = baseline + activeSum;

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ monthly_expenses: total })
    .eq("id", userId);
  if (updErr) return { error: updErr.message };

  return { ok: true, baseline, active: activeSum, total };
}
