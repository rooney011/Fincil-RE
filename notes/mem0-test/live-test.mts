/**
 * Live Mem0 recall test for the Fincil debate flow — the Mem0 counterpart of
 * notes/agentmem-test/live-test.mts. Same scenarios + seeds so the two systems
 * are directly comparable.
 *
 * Runs the REAL streamDebate() twice for one synthetic user:
 *   - Debate 1 seeds memory (rememberDebate writes the verdict to Mem0).
 *   - Debate 2 (related purchase) should recall debate 1.
 *
 * Bypasses the HTTP route + Supabase auth (can't drive a session headlessly) but
 * exercises the actual memory integration end to end via MEMORY_PROVIDER=mem0.
 *
 * Run (node 20.6+ can use --env-file; we also self-load .env.local so node 18 works):
 *   node --import tsx notes/mem0-test/live-test.mts
 *
 * Requires MEM0_API_KEY + OPENAI_API_KEY in .env.local. The script forces
 * MEMORY_PROVIDER=mem0 and FEATURE_AGENTMEM=true before importing the debate.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

// --- self-load .env.local (so this runs regardless of node --env-file support) ---
try {
  const raw = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  console.warn("Could not read .env.local — relying on already-set env vars.");
}

// Force the Mem0 backend ON before the memory module is imported (it reads these
// at import time). This is what makes the test exercise Mem0, not AgentMem.
process.env.MEMORY_PROVIDER = "mem0";
process.env.FEATURE_AGENTMEM = "true";

// Dynamic imports AFTER env is set, so module-load-time reads see the right values.
const { streamDebate } = await import("../../src/lib/ai/debate.ts");
const { computeFinanceVerdict } = await import("../../src/lib/finance/engine.ts");
const { memoryEnabled, memoryProvider } = await import("../../src/lib/ai/memory.ts");
const { default: MemoryClient } = await import("mem0ai");

// One user per run so re-runs stay clean; both debates share it so debate 2 can
// recall debate 1.
const USER_ID = `mem0-livetest-${Date.now()}`;

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
  recall: {
    agentId: string;
    round: number;
    ms: number;
    hitCount: number;
    keptCount: number;
    topRelevance: number | null;
    injectedChars: number;
  }[];
  recallTotalMs: number;
  writeMs: number;
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
      onRecall: (m: any) => recall.push(m),
      onWrite: (m: any) => { writeMs = m.ms; },
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
  console.log(`\n=== Mem0 live test ===`);
  console.log(`memoryProvider: ${memoryProvider}`);
  console.log(`memoryEnabled:  ${memoryEnabled}`);
  console.log(`user_id:        ${USER_ID}\n`);

  if (!memoryEnabled) {
    console.error(
      "memoryEnabled is FALSE — set MEM0_API_KEY in .env.local (FEATURE_AGENTMEM + MEMORY_PROVIDER are forced by this script). Aborting.",
    );
    process.exit(1);
  }

  // --- Debate 1: seed ---
  console.log("▶ Debate 1 (seed): laptop ₹80,000 …");
  const d1 = await runDebate("seed", "buy a new laptop for my freelance design work", 80_000);
  console.log(`  done in ${d1.ms}ms — verdict: ${d1.verdict}, ${d1.rounds} rounds`);
  console.log(`  memory tax: recall ${d1.recallTotalMs}ms across ${d1.recall.length} turns, write ${d1.writeMs}ms`);

  // --- Confirm the write + measure recall latency directly ---
  const client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });
  console.log("\n▶ Waiting 5s for async extraction, then searching Mem0 directly …");
  await new Promise((r) => setTimeout(r, 5000));

  const ts = performance.now();
  const searchRes: any = await client.search("should I buy a laptop", {
    filters: { AND: [{ user_id: USER_ID }] },
    topK: 5,
  });
  const searchMs = Math.round(performance.now() - ts);
  const directHits: any[] = Array.isArray(searchRes) ? searchRes : (searchRes?.results ?? []);
  console.log(`  direct search: ${directHits.length} hit(s) in ${searchMs}ms`);
  directHits.forEach((h: any) => console.log(`    [${h.score?.toFixed?.(3)}] (${h.agent_id ?? h.agentId ?? "?"}) ${h.memory}`));

  // --- Debate 2: recall ---
  console.log("\n▶ Debate 2 (recall): laptop upgrade ₹1,20,000 …");
  const d2 = await runDebate("recall", "upgrade to a more powerful ₹1,20,000 laptop", 120_000);
  console.log(`  done in ${d2.ms}ms — verdict: ${d2.verdict}, ${d2.rounds} rounds`);
  console.log(`  memory tax: recall ${d2.recallTotalMs}ms across ${d2.recall.length} turns, write ${d2.writeMs}ms`);
  console.log(`  per-turn recall:`);
  d2.recall.forEach((r) =>
    console.log(`    ${r.agentId} r${r.round}: ${r.ms}ms, ${r.hitCount} hit(s), ${r.keptCount} kept, topScore=${r.topRelevance?.toFixed?.(4) ?? "-"}, injected ${r.injectedChars} chars`),
  );

  const out = {
    ranAt: new Date().toISOString(),
    provider: memoryProvider,
    memoryEnabled,
    userId: USER_ID,
    directSearch: { ms: searchMs, hitCount: directHits.length, hits: directHits },
    debates: [d1, d2],
  };
  const outPath = "notes/mem0-test/live-test-result.json";
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n✔ Wrote ${outPath}`);

  for (const d of [d1, d2]) {
    console.log(`\n----- ${d.label.toUpperCase()} (${d.query}) -----`);
    for (const t of d.turns) console.log(`  [${t.agent} r${t.round}] ${t.content}`);
    console.log(`  VERDICT: ${d.verdict} — ${d.reasoning}`);
  }
}

main().catch((e) => {
  console.error("\nMEM0 LIVE TEST FAILED:", e);
  process.exit(1);
});
