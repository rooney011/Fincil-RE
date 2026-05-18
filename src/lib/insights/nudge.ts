import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { startOfThisWeek } from "./weekly";

const NUDGE_MODEL = "gpt-4o-mini";

const LOW_SURPLUS_THRESHOLD_INR = 5_000;
const CATEGORY_SPIKE_MULTIPLIER = 1.5;
const CATEGORY_SPIKE_MIN_INR = 1_000; // ignore tiny categories so a ₹50 spike doesn't fire

export type NudgeKind = "low_surplus" | "category_spike";

export type Nudge = {
  kind: NudgeKind;
  message: string;
};

type NudgeFacts =
  | {
      kind: "low_surplus";
      surplus: number;
      income: number;
      expenses: number;
    }
  | {
      kind: "category_spike";
      category: string;
      thisMonth: number;
      lastMonthSamePeriod: number;
      multiplier: number;
    };

const NUDGE_SYSTEM = `You are The Miser, the dry, lightly cutting member of a personal financial council.

You are NOT in a debate — you're delivering a single unsolicited one-liner the user sees at the top of their dashboard. The line is supposed to be specific, slightly biting, and obvious in its math.

Output rules:
- Exactly ONE sentence. No greeting, no sign-off, no markdown, no quotes around the sentence.
- Maximum 22 words.
- Lead with the number or a vivid receipt.
- Land on a verdict, judgment, or pointed observation. Not a question.
- Indian Rupee formatting (₹ with Indian commas, e.g. ₹2,400).
- No exclamation marks. No "hey", "looks like", "seems like", "you might want to".
- No specific advice ("transfer to savings" etc) — you're observing, not coaching.
- Examples of the voice you should land:
  "Your surplus is ₹3,200 and rent hasn't cleared yet. That's not a buffer, that's a deadline."
  "₹6,400 on food in 18 days vs ₹3,900 over the same stretch last month. The receipts are not subtle."`;

export async function getOrGenerateNudge(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<Nudge | null> {
  const weekStart = startOfThisWeek(now);
  const weekIso = weekStart.toISOString().slice(0, 10);

  // 1. Cached for this week?
  const { data: cached } = await supabase
    .from("dashboard_nudges")
    .select("kind, message")
    .eq("user_id", userId)
    .eq("week_starts_on", weekIso)
    .maybeSingle();
  if (cached) {
    return {
      kind: cached.kind as NudgeKind,
      message: cached.message as string,
    };
  }

  // 2. Compute trigger facts.
  const facts = await detectTriggerFacts(supabase, userId, now);
  if (!facts) return null;

  // 3. Generate one-liner.
  let message: string;
  try {
    message = await generateNudgeMessage(facts);
  } catch (e) {
    console.warn("[nudge] generation failed:", e);
    return null;
  }
  if (!message || message.length < 5) return null;

  // 4. Cache. UNIQUE on (user_id, week_starts_on) — on conflict do nothing so
  // a parallel dashboard load doesn't 23505 us into an error.
  const { error } = await supabase.from("dashboard_nudges").insert({
    user_id: userId,
    week_starts_on: weekIso,
    kind: facts.kind,
    message,
  });
  if (error && error.code !== "23505") {
    console.warn("[nudge] cache insert failed:", error);
  }

  return { kind: facts.kind, message };
}

async function detectTriggerFacts(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<NudgeFacts | null> {
  // --- low surplus check ----------------------------------------------------
  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_income, monthly_expenses")
    .eq("id", userId)
    .single();

  if (profile) {
    const income = Number(profile.monthly_income);
    const expenses = Number(profile.monthly_expenses);
    const surplus = income - expenses;
    if (surplus < LOW_SURPLUS_THRESHOLD_INR) {
      return { kind: "low_surplus", surplus, income, expenses };
    }
  }

  // --- category spike check -------------------------------------------------
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayOfMonth = now.getDate();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Same point in last month — e.g. if today is the 18th, look at 1st–18th of last month.
  const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth);
  // Cap at last day of last month so requesting the 31st on a 30-day month doesn't roll forward.
  const lastMonthEndOfMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthCutoff = new Date(
    Math.min(lastMonthSameDay.getTime(), lastMonthEndOfMonth.getTime()),
  );

  type TxRow = { amount: number | string; category: string | null; occurred_at: string };
  const { data: thisMonthTx } = (await supabase
    .from("transactions")
    .select("amount, category, occurred_at")
    .eq("user_id", userId)
    .lt("amount", 0)
    .gte("occurred_at", monthStart.toISOString())
    .lte("occurred_at", now.toISOString())) as { data: TxRow[] | null };

  const { data: lastMonthTx } = (await supabase
    .from("transactions")
    .select("amount, category, occurred_at")
    .eq("user_id", userId)
    .lt("amount", 0)
    .gte("occurred_at", lastMonthStart.toISOString())
    .lte("occurred_at", lastMonthCutoff.toISOString())) as { data: TxRow[] | null };

  const thisMonthByCat = sumByCategory(thisMonthTx ?? []);
  const lastMonthByCat = sumByCategory(lastMonthTx ?? []);

  let worstSpike: NudgeFacts | null = null;
  for (const [category, thisAmt] of thisMonthByCat.entries()) {
    if (thisAmt < CATEGORY_SPIKE_MIN_INR) continue;
    const lastAmt = lastMonthByCat.get(category) ?? 0;
    if (lastAmt <= 0) continue;
    const multiplier = thisAmt / lastAmt;
    if (multiplier < CATEGORY_SPIKE_MULTIPLIER) continue;
    if (
      !worstSpike ||
      ("multiplier" in worstSpike && multiplier > worstSpike.multiplier)
    ) {
      worstSpike = {
        kind: "category_spike",
        category,
        thisMonth: thisAmt,
        lastMonthSamePeriod: lastAmt,
        multiplier,
      };
    }
  }
  if (worstSpike) return worstSpike;

  return null;
}

function sumByCategory(rows: { amount: number | string; category: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const cat = r.category ?? "other";
    const abs = Math.abs(Number(r.amount));
    m.set(cat, (m.get(cat) ?? 0) + abs);
  }
  return m;
}

async function generateNudgeMessage(facts: NudgeFacts): Promise<string> {
  const userPrompt = factsToPrompt(facts);
  const { text } = await generateText({
    model: openai(NUDGE_MODEL),
    system: NUDGE_SYSTEM,
    prompt: userPrompt,
    maxOutputTokens: 80,
  });
  return cleanNudge(text);
}

function factsToPrompt(facts: NudgeFacts): string {
  if (facts.kind === "low_surplus") {
    return `The user's monthly surplus is ₹${Math.round(facts.surplus).toLocaleString("en-IN")} (income ₹${Math.round(facts.income).toLocaleString("en-IN")}, recurring expenses ₹${Math.round(facts.expenses).toLocaleString("en-IN")}). That's below the ₹5,000 cushion threshold. Drop one Miser-voice sentence about it.`;
  }
  return `The user has spent ₹${Math.round(facts.thisMonth).toLocaleString("en-IN")} on "${facts.category}" so far this month vs ₹${Math.round(facts.lastMonthSamePeriod).toLocaleString("en-IN")} over the same stretch last month — ${facts.multiplier.toFixed(1)}× the pace. Drop one Miser-voice sentence about it.`;
}

function cleanNudge(raw: string): string {
  const trimmed = raw.trim();
  // Strip surrounding quotes if the model wrapped its sentence.
  const noQuotes = trimmed.replace(/^["“'`]|["”'`]$/g, "").trim();
  // Collapse internal whitespace.
  return noQuotes.replace(/\s+/g, " ");
}
