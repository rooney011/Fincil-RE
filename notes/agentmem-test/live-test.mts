/**
 * Live AgentMem recall test for the Fincil debate flow.
 *
 * Runs the REAL streamDebate() twice for one synthetic user:
 *   - Debate 1 seeds memory (rememberVerdict writes the verdict).
 *   - Debate 2 (related purchase) should recall debate 1 via the middleware.
 *
 * Bypasses the HTTP route + Supabase auth (we can't drive a session
 * headlessly) but exercises the actual memory integration end to end.
 *
 * Run:
 *   node --env-file=.env.local --import tsx notes/agentmem-test/live-test.mts
 *
 * Requires AGENTMEM_API_KEY + FEATURE_AGENTMEM=true + OPENAI_API_KEY in env.
 */

import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { streamDebate } from "../../src/lib/ai/debate.ts";
import { computeFinanceVerdict } from "../../src/lib/finance/engine.ts";
import { memoryEnabled } from "../../src/lib/ai/memory.ts";
import { MemoryStore } from "@agentmem/sdk";

// One workflow per run so re-runs stay clean; both debates share it so
// debate 2 can recall debate 1.
const USER_ID = `agentmem-livetest-${Date.now()}`;

const profile = {
  monthly_income: 80_000,
  monthly_expenses: 45_000,
  role: "freelancer" as const,
  risk_tolerance: "medium" as const,
  display_name: "Test User",
  financial_goal: "Save ₹3,00,000 for an emergency fund",
};

type RunResult = {
  label: string;
  query: string;
  amount: number;
  ms: number;
  rounds: number;
  verdict: string;
  reasoning: string;
  turns: { agent: string; round: number; content: string }[];
  // Block G instrumentation:
  recall: { agentId: string; round: number; ms: number; hitCount: number; keptCount: number; topRelevance: number | null; injectedChars: number }[];
  recallTotalMs: number; // summed AgentMem search time = the per-debate "memory tax"
  writeMs: number;       // AgentMem verdict-write time
};

async function runDebate(label: string, query: string, amount: number): Promise<RunResult> {
  const financeVerdict = computeFinanceVerdict({ profile, amount, category: "electronics" });

  const turns: { agent: string; round: number; content: string }[] = [];
  let current: { agent: string; round: number; content: string } | null = null;
  const recall: RunResult["recall"] = [];
  let writeMs = 0;

  const write = (event: any) => {
    if (event.type === "agent") {
      current = { agent: event.agent, round: event.round, content: "" };
      turns.push(current);
    } else if (event.type === "chunk" && current) {
      current.content += event.text;
    }
  };

  const t0 = performance.now();
  const result = await streamDebate(
    {
      query,
      amount,
      category: "electronics",
      profile,
      financeVerdict,
      relevantTransactions: [],
      activeGoals: [],
      userId: USER_ID,
      onRecall: (m) => recall.push(m),
      onWrite: (m) => { writeMs = m.ms; },
    },
    write,
  );
  const ms = Math.round(performance.now() - t0);

  return {
    label,
    query,
    amount,
    ms,
    rounds: result.rounds,
    verdict: result.verdict,
    reasoning: result.reasoning,
    turns: turns.map((t) => ({ ...t, content: t.content.trim() })),
    recall,
    recallTotalMs: recall.reduce((s, r) => s + r.ms, 0),
    writeMs,
  };
}

async function main() {
  console.log(`\n=== AgentMem live test ===`);
  console.log(`memoryEnabled: ${memoryEnabled}`);
  console.log(`workflowId (userId): ${USER_ID}\n`);

  if (!memoryEnabled) {
    console.error("memoryEnabled is FALSE — set FEATURE_AGENTMEM=true and AGENTMEM_API_KEY. Aborting.");
    process.exit(1);
  }

  // --- Debate 1: seed ---
  console.log("▶ Debate 1 (seed): laptop ₹80,000 …");
  const d1 = await runDebate("seed", "buy a new laptop for my freelance design work", 80_000);
  console.log(`  done in ${d1.ms}ms — verdict: ${d1.verdict}, ${d1.rounds} rounds`);
  console.log(`  memory tax: recall ${d1.recallTotalMs}ms across ${d1.recall.length} turns, write ${d1.writeMs}ms`);

  // --- Confirm the write + measure recall latency directly ---
  const store = new MemoryStore({ apiKey: process.env.AGENTMEM_API_KEY! });
  console.log("\n▶ Waiting 5s for async extraction, then searching memory directly …");
  await new Promise((r) => setTimeout(r, 5000));

  const ts = performance.now();
  const hits = await store.search({
    query: "should I buy a laptop",
    agentId: "miser",
    workflowId: USER_ID,
    scope: "team",
    topK: 5,
  });
  const searchMs = Math.round(performance.now() - ts);
  console.log(`  direct search: ${hits.length} hit(s) in ${searchMs}ms`);
  hits.forEach((h: any) => console.log(`    [${h.score?.toFixed?.(3)}] (${h.agent_id}) ${h.content}`));

  // --- Debate 2: recall ---
  console.log("\n▶ Debate 2 (recall): laptop upgrade ₹1,20,000 …");
  const d2 = await runDebate("recall", "upgrade to a more powerful ₹1,20,000 laptop", 120_000);
  console.log(`  done in ${d2.ms}ms — verdict: ${d2.verdict}, ${d2.rounds} rounds`);
  console.log(`  memory tax: recall ${d2.recallTotalMs}ms across ${d2.recall.length} turns, write ${d2.writeMs}ms`);
  console.log(`  per-turn recall:`);
  d2.recall.forEach((r) => console.log(`    ${r.agentId} r${r.round}: ${r.ms}ms, ${r.hitCount} hit(s), ${r.keptCount} kept, topRel=${r.topRelevance?.toFixed?.(4) ?? "-"}, injected ${r.injectedChars} chars`));

  const out = {
    ranAt: new Date().toISOString(),
    memoryEnabled,
    userId: USER_ID,
    directSearch: { ms: searchMs, hitCount: hits.length, hits },
    debates: [d1, d2],
  };
  const outPath = "notes/agentmem-test/live-test-result.json";
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n✔ Wrote ${outPath}`);

  // Human-readable transcript dump
  for (const d of [d1, d2]) {
    console.log(`\n----- ${d.label.toUpperCase()} (${d.query}) -----`);
    for (const t of d.turns) console.log(`  [${t.agent} r${t.round}] ${t.content}`);
    console.log(`  VERDICT: ${d.verdict} — ${d.reasoning}`);
  }
}

main().catch((e) => {
  console.error("\nLIVE TEST FAILED:", e);
  process.exit(1);
});
