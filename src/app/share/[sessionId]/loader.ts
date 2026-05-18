import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SharedTurn = {
  agent: "miser" | "visionary";
  content: string;
  round: number;
};

export type SharedFinanceSnapshot = {
  surplus: number;
  estimatedEmi: number;
  emiImpactPercent: number;
  safety:
    | "trivial"
    | "cash"
    | "safe-emi"
    | "risky"
    | "dangerous"
    | "deferred";
  paymentMode: "cash" | "emi" | "deferred-loan";
  isEducation: boolean;
  mathVerdict: string;
};

export type SharedDebate = {
  id: string;
  query: string;
  amount: number;
  category: string | null;
  verdict: "approved" | "rejected" | null;
  reasoning: string | null;
  transcript: SharedTurn[];
  finance: SharedFinanceSnapshot;
  appealedRounds: number;
  createdAt: string;
};

/**
 * Public, anonymized loader for `/share/[sessionId]`. Returns the LATEST round
 * (original verdict, or the most recent appeal verdict if any).
 *
 * Uses the service-role client so unauthenticated visitors can read sessions
 * they don't own. We strip user_id, display_name, and any field that could
 * identify the owner before returning.
 */
export async function loadPublicSession(
  sessionId: string,
): Promise<SharedDebate | null> {
  if (!UUID_REGEX.test(sessionId)) return null;

  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("council_sessions")
    .select(
      "id, query, amount, category, verdict, reasoning, transcript, finance_snapshot, created_at",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;

  const { data: appeals } = await supabase
    .from("appeals")
    .select("round, new_verdict, new_transcript, new_finance_snapshot, reasoning")
    .eq("session_id", sessionId)
    .order("round", { ascending: false })
    .limit(1);

  const latestAppeal = appeals?.[0];
  const transcript = (latestAppeal?.new_transcript ?? session.transcript) as
    | SharedTurn[]
    | null;
  const verdict = (latestAppeal?.new_verdict ?? session.verdict) as
    | "approved"
    | "rejected"
    | null;
  const reasoning = (latestAppeal?.reasoning ?? session.reasoning) as
    | string
    | null;
  const finance = (latestAppeal?.new_finance_snapshot ??
    session.finance_snapshot) as SharedFinanceSnapshot;

  return {
    id: session.id as string,
    query: session.query as string,
    amount: Number(session.amount),
    category: (session.category as string | null) ?? null,
    verdict,
    reasoning,
    transcript: Array.isArray(transcript) ? transcript : [],
    finance,
    appealedRounds: (latestAppeal?.round as number | undefined) ?? 0,
    createdAt: session.created_at as string,
  };
}

/**
 * Pick a "best" line from the last turn of a persona — what we'd put on the
 * OG image or featured-quote slot. Picks the LAST round so it reflects the
 * persona's final position.
 */
export function bestLineFor(
  transcript: SharedTurn[],
  agent: "miser" | "visionary",
): string | null {
  const turns = transcript.filter((t) => t.agent === agent);
  if (turns.length === 0) return null;
  const last = turns[turns.length - 1];
  // Trim to the first sentence-ish so it fits a poster card.
  const first = last.content.split(/(?<=[.!?])\s+/)[0] ?? last.content;
  return first.length > 220 ? `${first.slice(0, 217).trimEnd()}…` : first;
}
