import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { embedQuery } from "@/lib/ai/embeddings";
import { computeFinanceVerdict } from "@/lib/finance/engine";
import {
  streamDebate,
  type RelevantTransaction,
  type ActiveGoal,
} from "@/lib/ai/debate";
import { encodeEvent, type StreamEvent } from "@/lib/ai/stream-protocol";

export const runtime = "nodejs";
// Streaming keeps the connection open; max duration is the upper bound.
export const maxDuration = 60;

const bodySchema = z.object({
  query: z.string().trim().min(1).max(500),
  amount: z.number().positive().max(100_000_000),
  category: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((s) => (s && s.length ? s : undefined)),
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
  const { query, amount, category } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select(
      "monthly_income, monthly_expenses, role, income_type, risk_tolerance, display_name, financial_goal",
    )
    .eq("id", user.id)
    .single();
  if (profileError || !profileRow) {
    return json(
      { error: "Profile not found — complete onboarding first." },
      404,
    );
  }

  const profile = {
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

  const financeVerdict = computeFinanceVerdict({ profile, amount, category });

  // RAG — best-effort.
  let relevantTransactions: RelevantTransaction[] = [];
  try {
    const queryEmbedding = await embedQuery(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;
    const { data: matches, error: matchError } = await supabase.rpc(
      "match_transactions",
      {
        query_embedding: embeddingStr,
        match_threshold: 0.5,
        match_count: 5,
        filter_user_id: user.id,
      },
    );
    if (matchError) {
      console.warn("[debate] match_transactions RPC failed:", matchError);
    } else if (Array.isArray(matches)) {
      relevantTransactions = matches.map((m: Record<string, unknown>) => ({
        description: String(m.description ?? ""),
        amount: Number(m.amount ?? 0),
        category: String(m.category ?? "other"),
        occurred_at: m.occurred_at ? String(m.occurred_at) : undefined,
        similarity:
          typeof m.similarity === "number" ? m.similarity : undefined,
      }));
    }
  } catch (e) {
    console.warn("[debate] RAG step failed; continuing without:", e);
  }

  // Active goals — best-effort. Empty list if query fails.
  let activeGoals: ActiveGoal[] = [];
  {
    const { data: goalsData, error: goalsError } = await supabase
      .from("savings_goals")
      .select("name, target_amount, current_amount, target_date, priority")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (goalsError) {
      console.warn("[debate] could not load goals:", goalsError);
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
            profile,
            financeVerdict,
            relevantTransactions,
            activeGoals,
          },
          write,
        );

        // Persist the session. Failure here doesn't break the UX — we still
        // emit the verdict, just with sessionId=null so the client knows
        // accept/decline isn't available for this debate.
        let sessionId: string | null = null;
        const { data: inserted, error: insertError } = await supabase
          .from("council_sessions")
          .insert({
            user_id: user.id,
            query,
            amount,
            category: category ?? null,
            verdict: result.verdict,
            transcript: result.transcript,
            finance_snapshot: financeVerdict,
          })
          .select("id")
          .single();
        if (insertError) {
          console.warn("[debate] council_sessions insert failed:", insertError);
        } else {
          sessionId = (inserted?.id as string | undefined) ?? null;
        }

        write({
          type: "verdict",
          verdict: result.verdict,
          reasoning: result.reasoning,
          sessionId,
          rounds: result.rounds,
        });
        write({ type: "done" });
      } catch (e) {
        console.error("[debate] stream errored:", e);
        write({
          type: "error",
          error:
            e instanceof Error
              ? e.message
              : "The Council ran into an error mid-debate.",
        });
        write({ type: "done" });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by upstream — fine.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Nginx-style buffering if behind a proxy.
      "X-Accel-Buffering": "no",
    },
  });
}
