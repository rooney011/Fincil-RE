import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  question: z.string().trim().min(1).max(500),
});

const MAX_TX_FOR_CONTEXT = 100;
const RECENT_DAYS = 90;

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
  if (!parsed.success) return json({ error: "Invalid input" }, 400);
  const { question } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select(
      "monthly_income, monthly_expenses, role, risk_tolerance, financial_goal, display_name, currency",
    )
    .eq("id", user.id)
    .single();

  const since = new Date();
  since.setDate(since.getDate() - RECENT_DAYS);
  const { data: txRows } = await supabase
    .from("transactions")
    .select("amount, description, category, source, occurred_at")
    .eq("user_id", user.id)
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(MAX_TX_FOR_CONTEXT);

  const txLines = (txRows ?? [])
    .map((t) => {
      const date = String(t.occurred_at).slice(0, 10);
      const amt = Number(t.amount);
      const direction = amt < 0 ? "−" : "+";
      return `  ${date} | ${direction}₹${Math.abs(amt).toLocaleString("en-IN")} | ${t.category} | ${t.description} (${t.source})`;
    })
    .join("\n");

  const profileBlock = profileRow
    ? `USER PROFILE
- Display name: ${profileRow.display_name ?? "—"}
- Role: ${profileRow.role}
- Monthly income: ₹${Number(profileRow.monthly_income).toLocaleString("en-IN")}
- Monthly expenses (recurring): ₹${Number(profileRow.monthly_expenses).toLocaleString("en-IN")}
- Risk tolerance: ${profileRow.risk_tolerance}
${profileRow.financial_goal ? `- Stated goal: ${profileRow.financial_goal}` : ""}`
    : "USER PROFILE: (not set up)";

  const txBlock =
    txLines.length > 0
      ? `RECENT TRANSACTIONS (last ${RECENT_DAYS} days, up to ${MAX_TX_FOR_CONTEXT} entries; − = outflow, + = inflow)
${txLines}`
      : "RECENT TRANSACTIONS: (none in window)";

  const system = `You answer factual questions about the user's spending and financial profile. Use ONLY the data provided below — do not invent numbers, transactions, or trends.

Rules:
- Be concise. 1–3 sentences for simple questions, a short bulleted breakdown for "how much per category"-style asks.
- When citing a number, format as ₹ with Indian commas (e.g., ₹4,500).
- If the data window doesn't contain enough to answer ("what did I spend last year?"), say so plainly. Don't extrapolate.
- If the user asks for advice, give one grounded observation but make clear this is not financial advice.
- Don't use markdown headings. Plain prose or compact bullets (-) only.

${profileBlock}

${txBlock}`;

  try {
    const result = streamText({
      model: openai("gpt-4o-mini"),
      system,
      prompt: question,
      temperature: 0.2,
    });
    return result.toTextStreamResponse();
  } catch (e) {
    console.error("[ask] streamText failed:", e);
    return json(
      {
        error:
          e instanceof Error ? e.message : "Failed to reach the answer model.",
      },
      500,
    );
  }
}
