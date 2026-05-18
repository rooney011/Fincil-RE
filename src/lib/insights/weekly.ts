import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WeekSummary = {
  weekStartsOn: string; // YYYY-MM-DD (Monday)
  totalSpend: number; // absolute value of outflows this week
  topCategory: { category: string; spend: number } | null;
  biggestExpense: {
    description: string;
    amount: number; // absolute value
    category: string;
    occurredAt: string;
  } | null;
  goalsOnTrack: number;
  goalsTotal: number;
};

/**
 * Monday-anchored week boundary in the user's timezone. We don't ask for a
 * timezone yet, so all dates here are interpreted as wall-clock IST (the
 * single locale this app targets — see POST_LAUNCH_PLAN.md §2).
 */
export function startOfThisWeek(today: Date = new Date()): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function computeWeekSummary(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<WeekSummary> {
  const weekStart = startOfThisWeek(now);

  // Outflows this week (amount < 0). Pull a generous window then aggregate
  // in JS — the volume is tiny (a single user, a single week).
  const { data: txs } = await supabase
    .from("transactions")
    .select("description, amount, category, occurred_at")
    .eq("user_id", userId)
    .lt("amount", 0)
    .gte("occurred_at", weekStart.toISOString())
    .lte("occurred_at", now.toISOString())
    .order("amount", { ascending: true }); // most negative first

  const rows = txs ?? [];
  let totalSpend = 0;
  const perCategory = new Map<string, number>();
  let biggest: WeekSummary["biggestExpense"] = null;

  for (const r of rows) {
    const abs = Math.abs(Number(r.amount));
    const cat = (r.category as string | null) ?? "other";
    totalSpend += abs;
    perCategory.set(cat, (perCategory.get(cat) ?? 0) + abs);
    if (!biggest || abs > biggest.amount) {
      biggest = {
        description: r.description as string,
        amount: abs,
        category: cat,
        occurredAt: r.occurred_at as string,
      };
    }
  }

  let topCategory: WeekSummary["topCategory"] = null;
  for (const [category, spend] of perCategory.entries()) {
    if (!topCategory || spend > topCategory.spend) {
      topCategory = { category, spend };
    }
  }

  // Goals: "on track" = at-or-above the linear progress they should have
  // by today, given target_date and current/target amounts. Goals with no
  // target_date are counted as on-track if they're at all advancing.
  const { data: goalsRaw } = await supabase
    .from("savings_goals")
    .select("target_amount, current_amount, target_date, created_at, status")
    .eq("user_id", userId)
    .eq("status", "active");

  const goals = goalsRaw ?? [];
  let onTrack = 0;
  for (const g of goals) {
    const target = Number(g.target_amount);
    const current = Number(g.current_amount);
    if (target <= 0) continue;
    if (!g.target_date) {
      if (current > 0) onTrack += 1;
      continue;
    }
    const created = new Date(g.created_at as string).getTime();
    const due = new Date(g.target_date as string).getTime();
    const elapsedFrac = Math.min(
      1,
      Math.max(0, (now.getTime() - created) / Math.max(1, due - created)),
    );
    const expectedAmount = elapsedFrac * target;
    if (current >= expectedAmount) onTrack += 1;
  }

  return {
    weekStartsOn: iso(weekStart),
    totalSpend,
    topCategory,
    biggestExpense: biggest,
    goalsOnTrack: onTrack,
    goalsTotal: goals.length,
  };
}
