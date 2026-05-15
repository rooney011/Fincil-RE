"use server";

import { z } from "zod";
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
