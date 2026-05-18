"use server";

import { z } from "zod";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { embedDocument } from "@/lib/ai/embeddings";
import { CATEGORIES } from "./constants";

const addSchema = z.object({
  description: z.string().trim().min(1).max(200),
  // negative = outflow, positive = inflow. Zero is meaningless.
  amount: z
    .number()
    .refine((n) => Number.isFinite(n), "Amount must be a number")
    .refine((n) => n !== 0, "Amount cannot be zero")
    .refine((n) => Math.abs(n) < 1_000_000_000, "Amount is unreasonably large"),
  category: z.enum(CATEGORIES),
  // YYYY-MM-DD from <input type="date"> or full ISO timestamp.
  occurred_at: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Invalid date"),
});

export type AddTransactionInput = z.input<typeof addSchema>;

export async function addTransaction(
  input: AddTransactionInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Some fields are invalid. Please check and retry." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Build a natural-language sentence for embedding — better semantic match
  // than embedding the raw description alone.
  const direction = parsed.data.amount < 0 ? "spent" : "received";
  const embedText = `${direction} ₹${Math.abs(parsed.data.amount)} on ${parsed.data.description} (${parsed.data.category})`;

  let embedding: string | null = null;
  try {
    const vec = await embedDocument(embedText);
    // pgvector accepts the [n,n,n] string format reliably across drivers.
    embedding = `[${vec.join(",")}]`;
  } catch (e) {
    // Don't fail the insert if embedding fails — store null, can backfill.
    console.error("[transactions] embedDocument failed:", e);
  }

  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    description: parsed.data.description,
    amount: parsed.data.amount,
    category: parsed.data.category,
    source: "manual",
    occurred_at: parsed.data.occurred_at,
    embedding,
  });

  if (error) return { error: error.message };

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true };
}

const importRowSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z
    .number()
    .refine((n) => Number.isFinite(n), "Amount must be a number")
    .refine((n) => n !== 0, "Amount cannot be zero")
    .refine((n) => Math.abs(n) < 1_000_000_000, "Amount is unreasonably large"),
  category: z.enum(CATEGORIES),
  occurred_at: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Invalid date"),
});

const importSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(2000),
});

export type ImportTransactionsInput = z.input<typeof importSchema>;

const IMPORT_EMBED_CONCURRENCY = 6;

export async function importTransactions(
  input: ImportTransactionsInput,
): Promise<{ ok: true; inserted: number } | { error: string }> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Some rows look invalid. Re-check and try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const dbRows = parsed.data.rows.map((r) => ({
    user_id: user.id,
    description: r.description,
    amount: r.amount,
    category: r.category,
    source: "manual" as const,
    occurred_at: r.occurred_at,
    embedding: null,
    is_demo: false,
  }));

  const { data: inserted, error } = await supabase
    .from("transactions")
    .insert(dbRows)
    .select("id, description, amount, category");

  if (error) return { error: error.message };

  const idsToEmbed = (inserted ?? []).map((row) => ({
    id: row.id as string,
    description: row.description as string,
    amount: Number(row.amount),
    category: row.category as string,
  }));

  // Same shape as demo-actions — embed in the background so the import is
  // instant. The rows are usable for everything except vector search until
  // the queue drains.
  after(async () => {
    const client = await createClient();
    let cursor = 0;
    async function worker() {
      while (cursor < idsToEmbed.length) {
        const idx = cursor;
        cursor += 1;
        const row = idsToEmbed[idx];
        const direction = row.amount < 0 ? "spent" : "received";
        const text = `${direction} ₹${Math.abs(row.amount)} on ${row.description} (${row.category})`;
        try {
          const vec = await embedDocument(text);
          const embedding = `[${vec.join(",")}]`;
          await client.from("transactions").update({ embedding }).eq("id", row.id);
        } catch (e) {
          console.error("[csv-import] background embed failed for", row.id, e);
        }
      }
    }
    const workers = Array.from(
      { length: Math.min(IMPORT_EMBED_CONCURRENCY, idsToEmbed.length) },
      worker,
    );
    await Promise.allSettled(workers);
  });

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, inserted: inserted?.length ?? 0 };
}

export async function deleteTransaction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  if (!id || typeof id !== "string") return { error: "Invalid id" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // RLS would reject cross-user deletes, but the explicit user_id eq is a
  // belt-and-suspenders guard against a policy regression.
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true };
}
