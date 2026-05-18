"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { embedDocument } from "@/lib/ai/embeddings";
import { generateDemoData } from "@/lib/demo/seed";

type Result = { ok: true; inserted: number } | { error: string };

const EMBED_CONCURRENCY = 6;

export async function seedDemoData(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Don't re-seed for someone who already has data — wipe first explicitly.
  const { count: existingDemo } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_demo", true);

  if ((existingDemo ?? 0) > 0) {
    return { error: "Demo data already exists. Reset it in Settings first." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_income")
    .eq("id", user.id)
    .single();

  const bundle = generateDemoData({
    userId: user.id,
    monthlyIncome: Number(profile?.monthly_income ?? 0),
    today: new Date(),
  });

  const txRows = bundle.transactions.map((t) => ({
    user_id: user.id,
    description: t.description,
    amount: t.amount,
    category: t.category,
    source: "manual" as const,
    occurred_at: t.occurred_at,
    embedding: null,
    is_demo: true,
  }));

  const { data: insertedTx, error: txErr } = await supabase
    .from("transactions")
    .insert(txRows)
    .select("id, description, amount, category");

  if (txErr) return { error: txErr.message };

  const goalRows = bundle.goals.map((g) => ({
    user_id: user.id,
    name: g.name,
    target_amount: g.target_amount,
    current_amount: g.current_amount,
    target_date: g.target_date,
    priority: g.priority,
    status: "active" as const,
    is_demo: true,
  }));

  const { error: goalErr } = await supabase.from("savings_goals").insert(goalRows);
  if (goalErr) return { error: goalErr.message };

  // Hand embeddings off to run after the response is flushed so the user lands
  // on /dashboard immediately. The council won't find RAG matches for the first
  // few seconds; by the time they navigate to /council, embeddings should be
  // ready. Failures are logged and leave embedding=null (the row is still
  // useful for everything except vector search).
  const idsToEmbed = (insertedTx ?? []).map((row) => ({
    id: row.id as string,
    description: row.description as string,
    amount: Number(row.amount),
    category: row.category as string,
  }));

  after(async () => {
    await embedInBackground(idsToEmbed);
  });

  revalidatePath("/", "layout");
  return { ok: true, inserted: insertedTx?.length ?? 0 };
}

export async function resetDemoData(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error: txErr } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", user.id)
    .eq("is_demo", true);
  if (txErr) return { error: txErr.message };

  const { error: goalErr } = await supabase
    .from("savings_goals")
    .delete()
    .eq("user_id", user.id)
    .eq("is_demo", true);
  if (goalErr) return { error: goalErr.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

async function embedInBackground(
  rows: Array<{ id: string; description: string; amount: number; category: string }>,
) {
  const supabase = await createClient();

  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const idx = cursor;
      cursor += 1;
      const row = rows[idx];
      const direction = row.amount < 0 ? "spent" : "received";
      const text = `${direction} ₹${Math.abs(row.amount)} on ${row.description} (${row.category})`;
      try {
        const vec = await embedDocument(text);
        const embedding = `[${vec.join(",")}]`;
        await supabase
          .from("transactions")
          .update({ embedding })
          .eq("id", row.id);
      } catch (e) {
        console.error("[demo-seed] background embed failed for", row.id, e);
      }
    }
  }

  const workers = Array.from({ length: Math.min(EMBED_CONCURRENCY, rows.length) }, worker);
  await Promise.allSettled(workers);
}
