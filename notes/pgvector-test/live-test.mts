/**
 * Live pgvector recall test for the Fincil debate flow — the baseline-floor
 * counterpart of notes/mem0-test/live-test.mts. Same scenarios + seeds.
 *
 * Runs the REAL streamDebate() twice for one synthetic user:
 *   - Debate 1 seeds memory (rememberDebate embeds + inserts into council_memories).
 *   - Debate 2 (related purchase) should recall debate 1 via cosine top-k.
 *
 * Requires the council_memories migration applied + SUPABASE_SERVICE_ROLE_KEY +
 * NEXT_PUBLIC_SUPABASE_URL + GOOGLE_GENERATIVE_AI_API_KEY in .env.local.
 *
 * Run: PATH=/tmp/node-v20.18.1-linux-x64/bin:$PATH node --import tsx notes/pgvector-test/live-test.mts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

// self-load .env.local
try {
  const raw = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch { console.warn("Could not read .env.local — relying on already-set env."); }

process.env.MEMORY_PROVIDER = "pgvector";
process.env.FEATURE_AGENTMEM = "true";

const { streamDebate } = await import("../../src/lib/ai/debate.ts");
const { computeFinanceVerdict } = await import("../../src/lib/finance/engine.ts");
const { memoryEnabled, memoryProvider } = await import("../../src/lib/ai/memory.ts");

// pgvector's user_id column is a uuid → use a real uuid (not a synthetic string).
const USER_ID = randomUUID();

const profile = {
  monthly_income: 80_000,
  monthly_expenses: 45_000,
  role: "freelancer" as const,
  risk_tolerance: "medium" as const,
  display_name: "Test User",
  financial_goal: "Save ₹3,00,000 for an emergency fund",
};

type RunResult = {
  label: string; query: string; amount: number; ms: number; rounds: number;
  verdict: string; reasoning: string;
  turns: { agent: string; round: number; content: string }[];
  recall: { agentId: string; round: number; ms: number; hitCount: number; keptCount: number; topRelevance: number | null; injectedChars: number }[];
  recallTotalMs: number; writeMs: number;
};

async function runDebate(label: string, query: string, amount: number): Promise<RunResult> {
  const financeVerdict = computeFinanceVerdict({ profile, amount, category: "electronics" });
  const turns: { agent: string; round: number; content: string }[] = [];
  let current: any = null;
  const recall: RunResult["recall"] = [];
  let writeMs = 0;
  const write = (event: any) => {
    if (event.type === "agent") { current = { agent: event.agent, round: event.round, content: "" }; turns.push(current); }
    else if (event.type === "chunk" && current) current.content += event.text;
  };
  const t0 = performance.now();
  const result = await streamDebate(
    { query, amount, category: "electronics", profile, financeVerdict, relevantTransactions: [], activeGoals: [], userId: USER_ID,
      onRecall: (m: any) => recall.push(m), onWrite: (m: any) => { writeMs = m.ms; } },
    write,
  );
  const ms = Math.round(performance.now() - t0);
  return { label, query, amount, ms, rounds: result.rounds, verdict: result.verdict, reasoning: result.reasoning,
    turns: turns.map((t) => ({ ...t, content: t.content.trim() })), recall, recallTotalMs: recall.reduce((s, r) => s + r.ms, 0), writeMs };
}

async function main() {
  console.log(`\n=== pgvector live test ===`);
  console.log(`memoryProvider: ${memoryProvider}`);
  console.log(`memoryEnabled:  ${memoryEnabled}`);
  console.log(`user_id:        ${USER_ID}\n`);
  if (!memoryEnabled) {
    console.error("memoryEnabled FALSE — need SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (and the migration applied). Aborting.");
    process.exit(1);
  }

  console.log("▶ Debate 1 (seed): laptop ₹80,000 …");
  const d1 = await runDebate("seed", "buy a new laptop for my freelance design work", 80_000);
  console.log(`  done in ${d1.ms}ms — verdict: ${d1.verdict}, ${d1.rounds} rounds`);
  console.log(`  memory tax: recall ${d1.recallTotalMs}ms, write ${d1.writeMs}ms`);

  console.log("\n▶ Debate 2 (recall): laptop upgrade ₹1,20,000 …");
  const d2 = await runDebate("recall", "upgrade to a more powerful ₹1,20,000 laptop", 120_000);
  console.log(`  done in ${d2.ms}ms — verdict: ${d2.verdict}, ${d2.rounds} rounds`);
  console.log(`  memory tax: recall ${d2.recallTotalMs}ms, write ${d2.writeMs}ms`);
  d2.recall.forEach((r) => console.log(`    ${r.agentId} r${r.round}: ${r.ms}ms, ${r.hitCount} hit(s), ${r.keptCount} kept, topSim=${r.topRelevance?.toFixed?.(4) ?? "-"}, injected ${r.injectedChars} chars`));

  writeFileSync("notes/pgvector-test/live-test-result.json", JSON.stringify({ ranAt: new Date().toISOString(), provider: memoryProvider, userId: USER_ID, debates: [d1, d2] }, null, 2));
  console.log(`\n✔ Wrote notes/pgvector-test/live-test-result.json`);

  for (const d of [d1, d2]) {
    console.log(`\n----- ${d.label.toUpperCase()} (${d.query}) -----`);
    for (const t of d.turns) console.log(`  [${t.agent} r${t.round}] ${t.content}`);
    console.log(`  VERDICT: ${d.verdict} — ${d.reasoning}`);
  }
}

main().catch((e) => { console.error("\nPGVECTOR LIVE TEST FAILED:", e); process.exit(1); });
