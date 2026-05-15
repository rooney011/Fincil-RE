import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { embedQuery, embedDocument } from "@/lib/ai/embeddings";
import { computeFinanceVerdict } from "@/lib/finance/engine";
import {
  streamDebate,
  type ActiveGoal,
  type DebateTurn,
  type RelevantTransaction,
} from "@/lib/ai/debate";
import { encodeEvent, type StreamEvent } from "@/lib/ai/stream-protocol";
import { extractIncome } from "@/lib/ai/extract-income";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  sessionId: z.uuid(),
  appealText: z.string().trim().min(1).max(2000),
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Invalid input" }, 400);
  }
  const { sessionId, appealText } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  // Load the original session.
  const { data: session, error: sessionError } = await supabase
    .from("council_sessions")
    .select("id, query, amount, category, verdict, transcript")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (sessionError || !session) {
    return json({ error: "Session not found" }, 404);
  }

  // Load prior appeals (for round counting + cumulative context).
  const { data: priorAppealsRaw, error: priorErr } = await supabase
    .from("appeals")
    .select(
      "round, appeal_text, extracted_income, extracted_income_recurring, new_transcript, new_verdict",
    )
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .order("round", { ascending: true });
  if (priorErr) {
    return json({ error: "Could not load prior appeals" }, 500);
  }
  const priorAppeals = priorAppealsRaw ?? [];
  const round = priorAppeals.length + 1;
  if (round > 5) {
    return json(
      { error: "You've already appealed 5 times. The Council is final now." },
      400,
    );
  }

  // Load profile.
  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select(
      "monthly_income, monthly_expenses, role, income_type, risk_tolerance, display_name, financial_goal",
    )
    .eq("id", user.id)
    .single();
  if (profileError || !profileRow) {
    return json({ error: "Profile not found" }, 404);
  }
  const baseProfile = {
    monthly_income: Number(profileRow.monthly_income),
    monthly_expenses: Number(profileRow.monthly_expenses),
    role: profileRow.role as
      | "student"
      | "freelancer"
      | "employee"
      | "business"
      | "general",
    income_type: profileRow.income_type as "fixed" | "variable",
    risk_tolerance: profileRow.risk_tolerance as "low" | "medium" | "high",
    display_name: (profileRow.display_name as string | null) ?? null,
    financial_goal: (profileRow.financial_goal as string | null) ?? null,
  };

  // Extract income from the appeal.
  const income = await extractIncome(appealText);
  const hasIncome =
    income.amount !== null &&
    income.amount > 0 &&
    income.confidence !== "none";

  // One-time income → log as an inflow adjustment transaction (source='adjustment').
  // Recurring income → don't log a transaction; bump the in-memory profile for
  // the re-debate's finance math (we do NOT persist the income change without
  // the user explicitly editing their profile).
  if (hasIncome && !income.recurring && income.amount) {
    const description = `Adjustment (appeal round ${round}): ${appealText.slice(0, 60)}`;
    let embeddingStr: string | null = null;
    try {
      const vec = await embedDocument(
        `received ₹${income.amount} as one-time income: ${appealText}`,
      );
      embeddingStr = `[${vec.join(",")}]`;
    } catch (e) {
      console.warn("[appeal] embed adjustment failed:", e);
    }
    const { error: adjError } = await supabase.from("transactions").insert({
      user_id: user.id,
      description,
      amount: Math.abs(income.amount),
      category: "other",
      source: "adjustment",
      occurred_at: new Date().toISOString(),
      embedding: embeddingStr,
    });
    if (adjError) {
      console.warn("[appeal] adjustment tx insert failed:", adjError);
    }
  }

  const augmentedProfile =
    hasIncome && income.recurring && income.amount
      ? {
          ...baseProfile,
          monthly_income: baseProfile.monthly_income + income.amount,
        }
      : baseProfile;

  const amount = Number(session.amount);
  const category = (session.category as string | null) ?? undefined;
  const query = session.query as string;

  const financeVerdict = computeFinanceVerdict({
    profile: augmentedProfile,
    amount,
    category,
  });

  // RAG — best-effort, on the original query.
  let relevantTransactions: RelevantTransaction[] = [];
  try {
    const queryEmbedding = await embedQuery(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;
    const { data: matches } = await supabase.rpc("match_transactions", {
      query_embedding: embeddingStr,
      match_threshold: 0.5,
      match_count: 5,
      filter_user_id: user.id,
    });
    if (Array.isArray(matches)) {
      relevantTransactions = matches.map((m: Record<string, unknown>) => ({
        description: String(m.description ?? ""),
        amount: Number(m.amount ?? 0),
        category: String(m.category ?? "other"),
        occurred_at: m.occurred_at ? String(m.occurred_at) : undefined,
      }));
    }
  } catch (e) {
    console.warn("[appeal] RAG failed; continuing without:", e);
  }

  // Active goals — same query as /api/debate. Repeated rather than shared
  // because it's two lines and the routes are stable.
  let activeGoals: ActiveGoal[] = [];
  {
    const { data: goalsData, error: goalsError } = await supabase
      .from("savings_goals")
      .select("name, target_amount, current_amount, target_date, priority")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (goalsError) {
      console.warn("[appeal] could not load goals:", goalsError);
    } else if (Array.isArray(goalsData)) {
      activeGoals = goalsData.map((g) => ({
        name: String(g.name ?? ""),
        target_amount: Number(g.target_amount ?? 0),
        current_amount: Number(g.current_amount ?? 0),
        target_date: (g.target_date as string | null) ?? null,
        priority: (g.priority as ActiveGoal["priority"]) ?? "medium",
      }));
    }
  }

  const appealContext = buildAppealContext({
    originalQuery: query,
    originalAmount: amount,
    originalVerdict: (session.verdict as "approved" | "rejected" | null) ?? "rejected",
    originalTranscript: parseTranscript(session.transcript),
    priorAppeals: priorAppeals.map((a) => ({
      round: a.round as number,
      appeal_text: a.appeal_text as string,
      extracted_income: a.extracted_income as number | null,
      extracted_income_recurring: a.extracted_income_recurring as boolean | null,
      new_transcript: parseTranscript(a.new_transcript),
      new_verdict: a.new_verdict as "approved" | "rejected",
    })),
    currentAppealText: appealText,
    currentExtraction: income,
    currentRound: round,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(event));
        } catch {
          closed = true;
        }
      };

      try {
        write({ type: "meta", financeVerdict });

        const result = await streamDebate(
          {
            query,
            amount,
            category,
            profile: augmentedProfile,
            financeVerdict,
            relevantTransactions,
            activeGoals,
            appealContext,
          },
          write,
        );

        // Persist appeal row.
        const { error: appealInsertError } = await supabase
          .from("appeals")
          .insert({
            session_id: sessionId,
            user_id: user.id,
            round,
            appeal_text: appealText,
            extracted_income: income.amount,
            extracted_income_confidence: income.confidence,
            extracted_income_recurring: income.recurring,
            new_transcript: result.transcript,
            new_verdict: result.verdict,
            new_finance_snapshot: financeVerdict,
          });
        if (appealInsertError) {
          console.warn(
            "[appeal] appeals insert failed:",
            appealInsertError,
          );
        }

        // Mark the session as appealed so /api/decide can see it's no longer
        // virgin state.
        await supabase
          .from("council_sessions")
          .update({ decision: "appealed" })
          .eq("id", sessionId)
          .eq("user_id", user.id);

        write({
          type: "verdict",
          verdict: result.verdict,
          reasoning: result.reasoning,
          sessionId,
          rounds: result.rounds,
        });
        write({ type: "done" });
      } catch (e) {
        console.error("[appeal] stream errored:", e);
        write({
          type: "error",
          error:
            e instanceof Error
              ? e.message
              : "The Council ran into an error during the appeal.",
        });
        write({ type: "done" });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function parseTranscript(raw: unknown): DebateTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t): t is Record<string, unknown> =>
        typeof t === "object" && t !== null && "agent" in t && "content" in t,
    )
    .map((t) => ({
      agent: (t.agent as DebateTurn["agent"]) ?? "miser",
      content: String(t.content ?? ""),
      round: typeof t.round === "number" ? t.round : 1,
    }));
}

function buildAppealContext(args: {
  originalQuery: string;
  originalAmount: number;
  originalVerdict: "approved" | "rejected";
  originalTranscript: DebateTurn[];
  priorAppeals: Array<{
    round: number;
    appeal_text: string;
    extracted_income: number | null;
    extracted_income_recurring: boolean | null;
    new_transcript: DebateTurn[];
    new_verdict: "approved" | "rejected";
  }>;
  currentAppealText: string;
  currentExtraction: {
    amount: number | null;
    confidence: "high" | "medium" | "low" | "none";
    recurring: boolean;
  };
  currentRound: number;
}): string {
  const formatTurns = (turns: DebateTurn[]) =>
    turns.length
      ? turns
          .map(
            (t) =>
              `    [${t.agent === "miser" ? "Miser" : "Visionary"}, r${t.round}]: ${t.content}`,
          )
          .join("\n")
      : "    (no turns recorded)";

  const lines: string[] = [
    "APPEAL HISTORY",
    `This is appeal round ${args.currentRound}. The user has come back with new information after the original verdict.`,
    "",
    `Original verdict: ${args.originalVerdict}`,
    `Original debate:`,
    formatTurns(args.originalTranscript),
  ];

  for (const a of args.priorAppeals) {
    lines.push("");
    lines.push(`Appeal round ${a.round}:`);
    lines.push(`  User's argument: "${a.appeal_text}"`);
    if (a.extracted_income !== null) {
      lines.push(
        `  Extracted income: ₹${a.extracted_income.toLocaleString("en-IN")} (${a.extracted_income_recurring ? "recurring" : "one-time"})`,
      );
    }
    lines.push(`  Verdict: ${a.new_verdict}`);
    lines.push(`  Debate:`);
    lines.push(formatTurns(a.new_transcript));
  }

  lines.push("");
  lines.push(`Current appeal (round ${args.currentRound}):`);
  lines.push(`  User's argument: "${args.currentAppealText}"`);
  if (
    args.currentExtraction.amount !== null &&
    args.currentExtraction.confidence !== "none"
  ) {
    lines.push(
      `  Extracted income: ₹${args.currentExtraction.amount.toLocaleString("en-IN")} (${args.currentExtraction.recurring ? "recurring — folded into profile income for this round's math" : "one-time — logged as an adjustment transaction"}, confidence: ${args.currentExtraction.confidence})`,
    );
  } else {
    lines.push(
      "  No specific income mentioned. The user is asking you to reconsider on the merits.",
    );
  }
  lines.push("");
  lines.push(
    "Weigh the new information. The math verdict above already reflects any recurring income bump.",
  );

  return lines.join("\n");
}
