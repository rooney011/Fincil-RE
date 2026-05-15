/**
 * Debate state machine — streaming variant.
 *
 * - Miser and Visionary turns stream token-by-token via `streamText`.
 * - The Referee and Twin use `generateObject` for structured outputs.
 *   Twin's verdict needs to be machine-routable, so we can't stream it.
 *
 * Replaces v1's CrewAI loop with explicit, debuggable control flow.
 */

import { streamText, generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

import type {
  FinanceVerdict,
  ProfileForEngine,
} from "@/lib/finance/engine";
import {
  MISER_SYSTEM,
  VISIONARY_SYSTEM,
  TWIN_SYSTEM,
  REFEREE_SYSTEM,
} from "./personas";
import type { StreamEvent } from "./stream-protocol";

export type Agent = "miser" | "visionary";

export type DebateTurn = {
  agent: Agent;
  content: string;
  round: number;
};

export type RelevantTransaction = {
  description: string;
  amount: number;
  category: string;
  occurred_at?: string;
  similarity?: number;
};

export type ActiveGoal = {
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  priority: "low" | "medium" | "high";
};

export type DebateProfile = ProfileForEngine & {
  display_name?: string | null;
  financial_goal?: string | null;
};

export type DebateInput = {
  query: string;
  amount: number;
  category?: string;
  profile: DebateProfile;
  financeVerdict: FinanceVerdict;
  relevantTransactions: RelevantTransaction[];
  activeGoals?: ActiveGoal[];
  // Pre-formatted block appended to every agent prompt. Used by /api/appeal to
  // pass prior rounds + extracted income context. Empty for first-round debates.
  appealContext?: string;
};

export type DebateResult = {
  transcript: DebateTurn[];
  verdict: "approved" | "rejected";
  reasoning: string;
  rounds: number;
};

// All four roles use the cheapest viable OpenAI model for local testing.
const PERSONA_MODEL = "gpt-4o-mini";
const TWIN_MODEL = "gpt-4o-mini";
const REFEREE_MODEL = "gpt-4o-mini";

const verdictSchema = z.object({
  verdict: z.enum(["approved", "rejected"]),
  reasoning: z.string().min(20).max(800),
});

const refereeSchema = z.object({
  decision: z.enum(["WINNER_MISER", "WINNER_VISIONARY", "CONTINUE"]),
});

type Writer = (event: StreamEvent) => void;

/**
 * Run the debate, streaming persona turns through `write`. Returns the
 * full transcript + verdict so the caller can persist it after the stream.
 *
 * The caller is responsible for emitting the leading `meta` event and the
 * final `verdict`/`done` events — this function just emits `agent` and
 * `chunk` events for each turn.
 */
export async function streamDebate(
  input: DebateInput,
  write: Writer,
): Promise<DebateResult> {
  // Trivial purchases short-circuit. The caller will emit verdict.
  if (input.financeVerdict.safety === "trivial") {
    return {
      transcript: [],
      verdict: "approved",
      reasoning:
        "The amount is trivial relative to your monthly surplus. No real risk here — buy it if you want to.",
      rounds: 0,
    };
  }

  const transcript: DebateTurn[] = [];
  const maxRounds = 5;
  let round = 0;

  while (round < maxRounds) {
    const miserText = await streamPersonaTurn({
      input,
      transcript,
      write,
      agent: "miser",
      round: round + 1,
      system: MISER_SYSTEM,
      label: "The Miser",
    });
    transcript.push({ agent: "miser", content: miserText, round: round + 1 });

    const visionaryText = await streamPersonaTurn({
      input,
      transcript,
      write,
      agent: "visionary",
      round: round + 1,
      system: VISIONARY_SYSTEM,
      label: "The Visionary",
    });
    transcript.push({
      agent: "visionary",
      content: visionaryText,
      round: round + 1,
    });

    round++;

    if (round >= 2) {
      const decision = await runReferee(input, transcript);
      if (decision !== "CONTINUE") break;
    }
  }

  const twin = await generateTwinVerdict(input, transcript);

  return {
    transcript,
    verdict: twin.verdict,
    reasoning: twin.reasoning,
    rounds: round,
  };
}

// --- helpers ----------------------------------------------------------------

async function streamPersonaTurn(args: {
  input: DebateInput;
  transcript: DebateTurn[];
  write: Writer;
  agent: Agent;
  round: number;
  system: string;
  label: string;
}): Promise<string> {
  const { input, transcript, write, agent, round, system, label } = args;

  write({ type: "agent", agent, round });

  const prompt = `${formatContext(input)}

DEBATE SO FAR
${formatTranscript(transcript)}

Your turn as ${label}. 2–3 sentences. Direct.`;

  const result = streamText({
    model: openai(PERSONA_MODEL),
    system,
    prompt,
    temperature: 0.6,
  });

  let full = "";
  for await (const chunk of result.textStream) {
    full += chunk;
    write({ type: "chunk", text: chunk });
  }
  return full.trim();
}

function formatContext(input: DebateInput): string {
  const { profile, query, amount, category, financeVerdict } = input;

  const txLines = input.relevantTransactions.length
    ? input.relevantTransactions
        .map((t) => {
          const date = t.occurred_at
            ? new Date(t.occurred_at).toISOString().slice(0, 10)
            : "unknown date";
          const direction = t.amount < 0 ? "spent" : "received";
          return `  - ${date}: ${direction} ₹${Math.abs(t.amount).toLocaleString("en-IN")} on ${t.description} (${t.category})`;
        })
        .join("\n")
    : "  (none surfaced by semantic search)";

  return `THE QUESTION
User wants to: ${query}
Amount: ₹${amount.toLocaleString("en-IN")}${category ? ` (${category})` : ""}

USER PROFILE
- Role: ${profile.role}
- Monthly income: ₹${profile.monthly_income.toLocaleString("en-IN")} (${profile.income_type})
- Monthly expenses: ₹${profile.monthly_expenses.toLocaleString("en-IN")}
- Risk tolerance: ${profile.risk_tolerance}
${profile.financial_goal ? `- Stated goal: ${profile.financial_goal}` : ""}

MATH VERDICT (ground truth — do not contradict)
${financeVerdict.mathVerdict}
- Surplus: ₹${financeVerdict.surplus.toLocaleString("en-IN")}
- Estimated EMI (12mo @ 5%): ₹${Math.round(financeVerdict.estimatedEmi).toLocaleString("en-IN")}
- EMI as % of surplus: ${Number.isFinite(financeVerdict.emiImpactPercent) ? `${Math.round(financeVerdict.emiImpactPercent)}%` : "infinite"}
- Safety: ${financeVerdict.safety}
- Payment mode: ${financeVerdict.paymentMode}

USER'S RELEVANT PAST SPENDING
${txLines}${formatActiveGoals(input.activeGoals)}${input.appealContext ? `\n\n${input.appealContext}` : ""}`;
}

function formatActiveGoals(goals: ActiveGoal[] | undefined): string {
  if (!goals || goals.length === 0) return "";
  const lines = goals.map((g) => {
    const pct = g.target_amount > 0
      ? Math.round((g.current_amount / g.target_amount) * 100)
      : 0;
    const remaining = Math.max(0, g.target_amount - g.current_amount);
    const dateLine = g.target_date
      ? ` by ${g.target_date}`
      : "";
    return `  - ${g.name} [${g.priority} priority]: ₹${g.current_amount.toLocaleString("en-IN")} of ₹${g.target_amount.toLocaleString("en-IN")} saved (${pct}%, ₹${remaining.toLocaleString("en-IN")} remaining)${dateLine}`;
  });
  return `\n\nACTIVE SAVINGS GOALS (the Miser should weigh whether this purchase pushes these back)\n${lines.join("\n")}`;
}

function formatTranscript(transcript: DebateTurn[]): string {
  if (transcript.length === 0) return "  (the debate has not started)";
  return transcript
    .map(
      (t) =>
        `  [${t.agent === "miser" ? "Miser" : "Visionary"}, round ${t.round}]: ${t.content}`,
    )
    .join("\n");
}

async function runReferee(
  input: DebateInput,
  transcript: DebateTurn[],
): Promise<"WINNER_MISER" | "WINNER_VISIONARY" | "CONTINUE"> {
  const prompt = `${formatContext(input)}

DEBATE SO FAR
${formatTranscript(transcript)}

Decide the next step.`;

  try {
    const { object } = await generateObject({
      model: openai(REFEREE_MODEL),
      system: REFEREE_SYSTEM,
      schema: refereeSchema,
      prompt,
      temperature: 0.2,
    });
    return object.decision;
  } catch (e) {
    console.warn("[debate] referee failed; continuing:", e);
    return "CONTINUE";
  }
}

async function generateTwinVerdict(
  input: DebateInput,
  transcript: DebateTurn[],
): Promise<{ verdict: "approved" | "rejected"; reasoning: string }> {
  const prompt = `${formatContext(input)}

FULL DEBATE TRANSCRIPT
${formatTranscript(transcript)}

Render your verdict.`;

  const { object } = await generateObject({
    model: openai(TWIN_MODEL),
    system: TWIN_SYSTEM,
    schema: verdictSchema,
    prompt,
    temperature: 0.3,
  });

  return object;
}
