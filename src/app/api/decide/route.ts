import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { embedDocument } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  sessionId: z.uuid(),
  action: z.enum(["accept", "decline"]),
});

type FinanceSnapshot = {
  surplus: number;
  estimatedEmi: number;
  emiImpactPercent: number;
  safety: string;
  paymentMode: "cash" | "emi" | "deferred-loan";
  isEducation: boolean;
  mathVerdict: string;
};

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { sessionId, action } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load the session.
  const { data: sessionRow, error: sessionError } = await supabase
    .from("council_sessions")
    .select("id, query, amount, category, verdict, finance_snapshot, decision")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (sessionError || !sessionRow) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  // 'appealed' is an intermediate state — user is still allowed to accept or
  // decline the latest appeal's verdict. Only 'accepted' / 'declined' are terminal.
  if (
    sessionRow.decision &&
    sessionRow.decision !== "appealed" &&
    sessionRow.decision !== "negotiated"
  ) {
    return NextResponse.json(
      { error: `This debate was already ${sessionRow.decision}.` },
      { status: 409 },
    );
  }

  // If there are appeals, use the LATEST appeal's verdict and finance snapshot —
  // that's what the user actually saw when they clicked Accept/Decline.
  const { data: latestAppeal } = await supabase
    .from("appeals")
    .select("round, new_verdict, new_finance_snapshot")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();

  const finance = (latestAppeal?.new_finance_snapshot ??
    sessionRow.finance_snapshot) as FinanceSnapshot;
  const amount = Number(sessionRow.amount);
  const verdict = (latestAppeal?.new_verdict ??
    sessionRow.verdict) as "approved" | "rejected" | null;
  const query = sessionRow.query as string;
  const category = (sessionRow.category as string | null) ?? "other";

  // ---- decline path ---------------------------------------------------------
  if (action === "decline") {
    const { error } = await supabase
      .from("council_sessions")
      .update({ decision: "declined" })
      .eq("id", sessionId)
      .eq("user_id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, decision: "declined" });
  }

  // ---- accept path ----------------------------------------------------------
  if (verdict !== "approved") {
    return NextResponse.json(
      { error: "Cannot accept a debate the Twin did not approve." },
      { status: 400 },
    );
  }

  // Negative-balance guard: refuse to log an EMI that would push expenses
  // past income. The engine + Twin should already prevent this, but the
  // user can change profile values between debates — re-check at decide time.
  if (finance.paymentMode === "emi") {
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("monthly_income, monthly_expenses")
      .eq("id", user.id)
      .single();
    if (profileError || !profileRow) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 },
      );
    }
    const income = Number(profileRow.monthly_income);
    const expenses = Number(profileRow.monthly_expenses);
    if (expenses + finance.estimatedEmi > income) {
      return NextResponse.json(
        {
          error:
            "Accepting this EMI would push your monthly expenses past your income. Revisit the budget first.",
        },
        { status: 422 },
      );
    }
  }

  if (finance.paymentMode === "deferred-loan") {
    return NextResponse.json(
      { error: "This decision is marked deferred — no purchase to log." },
      { status: 400 },
    );
  }

  // Build the transaction. Always log the full purchase price as the
  // transaction event — EMI vs cash affects the recurring expense bump,
  // not the discrete purchase record.
  const description = `Council: ${query}`;
  const txAmount = -Math.abs(amount);

  // Embed the council purchase the same way manual adds do.
  let embeddingStr: string | null = null;
  try {
    const direction = "spent";
    const embedText = `${direction} ₹${Math.abs(amount)} on ${query} (${category})`;
    const vec = await embedDocument(embedText);
    embeddingStr = `[${vec.join(",")}]`;
  } catch (e) {
    console.warn("[decide] embed failed; storing null:", e);
  }

  const { error: txError } = await supabase.from("transactions").insert({
    user_id: user.id,
    description,
    amount: txAmount,
    category,
    source: "council",
    occurred_at: new Date().toISOString(),
    embedding: embeddingStr,
  });
  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  // For EMI: bump recurring monthly_expenses so future debates know this
  // purchase is now a standing commitment.
  if (finance.paymentMode === "emi") {
    const { data: current, error: readError } = await supabase
      .from("profiles")
      .select("monthly_expenses")
      .eq("id", user.id)
      .single();
    if (readError || !current) {
      console.warn("[decide] could not read profile for EMI bump:", readError);
    } else {
      const newExpenses =
        Number(current.monthly_expenses) + finance.estimatedEmi;
      const { error: updError } = await supabase
        .from("profiles")
        .update({ monthly_expenses: newExpenses })
        .eq("id", user.id);
      if (updError) {
        console.warn("[decide] EMI expense bump failed:", updError);
      }
    }
  }

  const { error: decisionError } = await supabase
    .from("council_sessions")
    .update({ decision: "accepted" })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (decisionError) {
    console.warn("[decide] could not mark session accepted:", decisionError);
  }

  return NextResponse.json({
    ok: true,
    decision: "accepted",
    paymentMode: finance.paymentMode,
    loggedAmount: txAmount,
    expensesBumped:
      finance.paymentMode === "emi" ? finance.estimatedEmi : null,
  });
}
