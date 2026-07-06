/**
 * DinoMem live test for the Fincil debate flow.
 *
 * Tests four things:
 *   1. Recall benchmark  — same 3-debate sweep as agentmem/mem0/pgvector.
 *   2. P1 (bi-temporal) — verify factKey supersession via GET /v1/memory/:id/history.
 *   3. P2 (receipts)    — verify every search leaves an immutable receipt.
 *   4. P0 (conflicts)   — write the same factKey from 3 persona agents concurrently
 *                         and inspect GET /v1/crdt/conflicts.
 *
 * Requires DINOMEM_API_KEY (or AGENTMEM_API_KEY aliased below) + OPENAI_API_KEY
 * + GOOGLE_GENERATIVE_AI_API_KEY + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 * in .env.local. Set MEMORY_PROVIDER=dinomem and FEATURE_AGENTMEM=true.
 *
 * Run:
 *   node --env-file=.env.local --import tsx notes/dinomem-test/live-test.mts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

// Self-load .env.local (mirrors pgvector-test pattern for robustness).
try {
  const raw = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch {
  console.warn("Could not read .env.local — relying on already-set env.");
}

// Allow re-using the existing AGENTMEM_API_KEY as DINOMEM_API_KEY (same key,
// same DinoMem org).
if (!process.env.DINOMEM_API_KEY && process.env.AGENTMEM_API_KEY) {
  process.env.DINOMEM_API_KEY = process.env.AGENTMEM_API_KEY;
  console.log("(aliased AGENTMEM_API_KEY → DINOMEM_API_KEY)");
}

process.env.MEMORY_PROVIDER = "dinomem";
process.env.FEATURE_AGENTMEM = "true";

const { streamDebate } = await import("../../src/lib/ai/debate.ts");
const { computeFinanceVerdict } = await import("../../src/lib/finance/engine.ts");
const { memoryEnabled, memoryProvider } = await import("../../src/lib/ai/memory.ts");

const BASE_URL =
  process.env.DINOMEM_BASE_URL ??
  "https://lwbwcuuzoituanwhekyo.supabase.co/functions/v1/api";
const API_KEY = process.env.DINOMEM_API_KEY!;

async function dinomemGet(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return res.json();
}
async function dinomemPost(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Per-run userId: use a uuid-like string so recall is isolated and repeatable.
const USER_ID = `dinomem-livetest-${randomUUID().slice(0, 8)}`;

const profile = {
  monthly_income: 80_000,
  monthly_expenses: 45_000,
  role: "freelancer" as const,
  risk_tolerance: "medium" as const,
  display_name: "Test User",
  financial_goal: "Save ₹3,00,000 for an emergency fund",
};

type RecallRow = {
  agentId: string;
  round: number;
  ms: number;
  hitCount: number;
  keptCount: number;
  topRelevance: number | null;
  injectedChars: number;
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
  recall: RecallRow[];
  recallTotalMs: number;
  writeMs: number;
};

async function runDebate(
  label: string,
  query: string,
  amount: number,
): Promise<RunResult> {
  const financeVerdict = computeFinanceVerdict({ profile, amount, category: "electronics" });
  const turns: { agent: string; round: number; content: string }[] = [];
  let current: { agent: string; round: number; content: string } | null = null;
  const recall: RecallRow[] = [];
  let writeMs = 0;

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
    (event: any) => {
      if (event.type === "agent") {
        current = { agent: event.agent, round: event.round, content: "" };
        turns.push(current);
      } else if (event.type === "chunk" && current) {
        current.content += event.text;
      }
    },
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
  console.log(`\n${"=".repeat(60)}`);
  console.log("DinoMem live test — Fincil council debate");
  console.log(`${"=".repeat(60)}`);
  console.log(`memoryProvider : ${memoryProvider}`);
  console.log(`memoryEnabled  : ${memoryEnabled}`);
  console.log(`userId         : ${USER_ID}`);
  console.log(`baseUrl        : ${BASE_URL}`);

  if (!memoryEnabled) {
    console.error(
      "\nERROR: memoryEnabled=false. Set DINOMEM_API_KEY (or AGENTMEM_API_KEY) + FEATURE_AGENTMEM=true. Aborting.",
    );
    process.exit(1);
  }

  // --- SECTION 1: recall benchmark (same 3-debate sweep as other systems) ---

  console.log("\n--- SECTION 1: Recall benchmark (N=3 parity sweep) ---");

  console.log("\n▶ Debate 1 (seed): laptop ₹80,000 …");
  const d1 = await runDebate(
    "seed",
    "buy a new laptop for my freelance design work",
    80_000,
  );
  console.log(
    `  done ${d1.ms}ms  verdict=${d1.verdict}  rounds=${d1.rounds}  tax: recall=${d1.recallTotalMs}ms write=${d1.writeMs}ms`,
  );
  d1.recall.forEach((r) =>
    console.log(
      `    ${r.agentId} r${r.round}: ${r.ms}ms  hits=${r.hitCount} kept=${r.keptCount} topRel=${r.topRelevance?.toFixed(4) ?? "-"} injected=${r.injectedChars}ch`,
    ),
  );

  console.log("\n▶ Debate 2 (recall): laptop upgrade ₹1,20,000 …");
  const d2 = await runDebate(
    "recall-related",
    "upgrade to a more powerful ₹1,20,000 laptop",
    120_000,
  );
  console.log(
    `  done ${d2.ms}ms  verdict=${d2.verdict}  rounds=${d2.rounds}  tax: recall=${d2.recallTotalMs}ms write=${d2.writeMs}ms`,
  );
  d2.recall.forEach((r) =>
    console.log(
      `    ${r.agentId} r${r.round}: ${r.ms}ms  hits=${r.hitCount} kept=${r.keptCount} topRel=${r.topRelevance?.toFixed(4) ?? "-"} injected=${r.injectedChars}ch`,
    ),
  );

  console.log("\n▶ Debate 3 (cold-start): shoes ₹5,000 (unrelated, should not recall) …");
  const d3 = await runDebate(
    "cold-start",
    "buy a new pair of running shoes",
    5_000,
  );
  console.log(
    `  done ${d3.ms}ms  verdict=${d3.verdict}  rounds=${d3.rounds}  tax: recall=${d3.recallTotalMs}ms write=${d3.writeMs}ms`,
  );
  d3.recall.forEach((r) =>
    console.log(
      `    ${r.agentId} r${r.round}: ${r.ms}ms  hits=${r.hitCount} kept=${r.keptCount} topRel=${r.topRelevance?.toFixed(4) ?? "-"} injected=${r.injectedChars}ch`,
    ),
  );

  // --- SECTION 2: P1 bi-temporal — verify factKey supersession ---

  console.log("\n--- SECTION 2: P1 bi-temporal — factKey supersession ---");

  // Debate 1 and 2 both wrote "fincil.purchase.buy-a-new-laptop-for-my-freelanc"
  // (same factKey prefix from the same query slug). Debate 2 should have
  // superseded debate 1's fact window.
  const slug = "buy-a-new-laptop-for-my-freelanc";
  const histSearch = await dinomemPost("/v1/memory/search", {
    query: `laptop ${slug}`,
    agentId: "fincil-probe",
    workflowId: USER_ID,
    topK: 5,
  }) as any[];

  console.log(`\nHistory search (workflowId=${USER_ID}) returned ${histSearch?.length ?? 0} hits`);
  for (const h of histSearch ?? []) {
    const id = h.id as string;
    console.log(`  id=${id.slice(0, 8)} created=${h.created_at?.slice(0, 19) ?? "?"} score=${h.score?.toFixed(4)}`);
    // Fetch lineage for each hit.
    const hist = await dinomemGet(`/v1/memory/${id}/history`) as any;
    const sup = hist?.supersededBy ?? hist?.superseded_by;
    const supBy = hist?.supersedes ?? [];
    console.log(`    supersededBy=${sup ? sup.slice(0, 8) : "none"} supersedes=${supBy.length} older version(s)`);
  }

  // --- SECTION 3: P2 receipts — every search leaves a receipt ---

  console.log("\n--- SECTION 3: P2 receipts ---");

  const receiptsRes = await dinomemGet("/v1/receipts?limit=10") as any;
  const receipts = receiptsRes?.receipts ?? receiptsRes ?? [];
  console.log(`Recent receipts: ${receipts.length}`);
  for (const r of receipts.slice(0, 5)) {
    console.log(
      `  reader=${r.reader_agent ?? r.readerAgent ?? "?"} query="${String(r.query ?? "").slice(0, 40)}" ids=${(r.returned_ids ?? r.returnedIds ?? []).length}`,
    );
  }

  // --- SECTION 4: P0 conflicts — concurrent factKey writes from 3 personas ---

  console.log("\n--- SECTION 4: P0 conflicts — concurrent multi-agent writes ---");

  const conflictKey = `fincil.purchase.phone-conflict-probe-${USER_ID.slice(-8)}`;
  console.log(`\nWriting factKey="${conflictKey}" from 3 agents concurrently…`);

  const [misW, visW, twinW] = await Promise.all([
    dinomemPost("/v1/memory/write", {
      content: "Miser: REJECT this phone — ₹30,000 is 86% of surplus. Too risky.",
      agentId: "fincil-miser",
      workflowId: USER_ID,
      scope: "team",
      factKey: conflictKey,
    }),
    dinomemPost("/v1/memory/write", {
      content: "Visionary: APPROVE the phone — productivity multiplier for work.",
      agentId: "fincil-visionary",
      workflowId: USER_ID,
      scope: "team",
      factKey: conflictKey,
    }),
    dinomemPost("/v1/memory/write", {
      content: "Twin: APPROVE with conditions — budget 3-month EMI, review at month 2.",
      agentId: "fincil-twin",
      workflowId: USER_ID,
      scope: "team",
      factKey: conflictKey,
    }),
  ]);

  console.log(
    `  miser writeId=${(misW as any).writeId?.slice(0, 8) ?? "?"} conflictsChecked=${(misW as any).conflictsChecked}`,
  );
  console.log(
    `  visionary writeId=${(visW as any).writeId?.slice(0, 8) ?? "?"} conflictsChecked=${(visW as any).conflictsChecked}`,
  );
  console.log(
    `  twin writeId=${(twinW as any).writeId?.slice(0, 8) ?? "?"} conflictsChecked=${(twinW as any).conflictsChecked}`,
  );

  const conflictsRes = await dinomemGet("/v1/crdt/conflicts") as any;
  const conflicts = conflictsRes?.conflicts ?? [];
  console.log(`\nOpen conflicts after 3-way write: ${conflicts.length}`);
  for (const c of conflicts) {
    console.log(
      `  key=${c.key ?? c.factKey ?? "?"} policy=${c.policy ?? "?"} values=${c.values?.length ?? 0}`,
    );
    for (const v of c.values ?? []) {
      console.log(`    agent=${v.agentId ?? v.agent_id ?? "?"}: ${String(v.value ?? "").slice(0, 60)}`);
    }
  }

  // --- Write results ---

  const output = {
    ranAt: new Date().toISOString(),
    provider: memoryProvider,
    userId: USER_ID,
    debates: [d1, d2, d3],
    p1_history_hits: histSearch?.length ?? 0,
    p2_receipts: receipts.length,
    p0_open_conflicts: conflicts.length,
  };

  writeFileSync(
    "notes/dinomem-test/live-test-result.json",
    JSON.stringify(output, null, 2),
  );
  console.log("\n✔ Wrote notes/dinomem-test/live-test-result.json");

  // --- Print debate transcripts ---
  for (const d of [d1, d2, d3]) {
    console.log(`\n----- ${d.label.toUpperCase()} (${d.query.slice(0, 50)}) -----`);
    for (const t of d.turns) {
      console.log(`  [${t.agent} r${t.round}] ${t.content.slice(0, 200)}`);
    }
    console.log(`  VERDICT: ${d.verdict} — ${d.reasoning}`);
  }
}

main().catch((e) => {
  console.error("\nDINOMEM LIVE TEST FAILED:", e);
  process.exit(1);
});
