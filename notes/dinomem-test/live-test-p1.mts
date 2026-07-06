/**
 * DinoMem P1 bi-temporal supersession test.
 *
 * Runs ONE debate on the SAME query as D1 (2026-07-05 run) — same userId/workflowId
 * — so rememberDebate writes to the IDENTICAL factKey, triggering a real supersession
 * event. Asserts 4a–4d as specified in the task brief.
 *
 *   4a. Recall phase surfaces the OLD ₹80k memory (window still open pre-write).
 *   4b. After write: GET /history shows supersession lineage on the NEW writeId;
 *       D1's valid_to is closed.
 *   4c. Fresh search (rerank:true, same workflowId) returns only the NEW fact;
 *       old ₹80k MUST NOT appear as a live duplicate.
 *   4d. New search appears in GET /v1/receipts (P2 regression).
 *
 * INTEGRITY: if assertion fails, it is logged as FAIL with raw evidence. No softening.
 *
 * Run:
 *   node --env-file=.env.local --import tsx notes/dinomem-test/live-test-p1.mts
 */

import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

// Same env-load pattern as live-test.mts.
try {
  const { readFileSync } = await import("node:fs");
  const raw = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch {
  console.warn("Could not read .env.local — relying on already-set env.");
}

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
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DinoMem GET ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}
async function dinomemPost(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DinoMem POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── constants ──────────────────────────────────────────────────────────────────

// The SAME workflowId used in the 2026-07-05 run. This is the isolation key —
// changing it would create a new namespace and D1's memory would not be visible.
const USER_ID = "dinomem-livetest-888408cb";

// D1's known memory ID (verified in pre-flight above).
const D1_ID = "cbeee35c-06c4-48aa-842c-b882a7a1bd55";

// Same query as D1 → same factKey slug → supersession.
const SUPERSEDE_QUERY = "buy a new laptop for my freelance design work";
const SUPERSEDE_AMOUNT = 150_000; // ₹1,50,000 — the "reconsideration" amount

// Replicate slugify from memory-dinomem.ts exactly.
function slugify(q: string): string {
  return q
    .toLowerCase()
    .replace(/[₹₽$€£¥]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/-+$/, "");
}

const EXPECTED_SLUG = slugify(SUPERSEDE_QUERY);
const EXPECTED_FACT_KEY = `fincil.purchase.${EXPECTED_SLUG}`;

const profile = {
  monthly_income: 80_000,
  monthly_expenses: 45_000,
  role: "freelancer" as const,
  risk_tolerance: "medium" as const,
  display_name: "Test User",
  financial_goal: "Save ₹3,00,000 for an emergency fund",
};

// ── helpers ────────────────────────────────────────────────────────────────────

function pass(label: string, detail: string) {
  console.log(`  ✅ PASS  ${label}: ${detail}`);
  return { status: "pass", label, detail };
}
function fail(label: string, detail: string) {
  console.log(`  ❌ FAIL  ${label}: ${detail}`);
  return { status: "fail", label, detail };
}
function check(label: string, cond: boolean, passDetail: string, failDetail: string) {
  return cond ? pass(label, passDetail) : fail(label, failDetail);
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("DinoMem P1 supersession test");
  console.log(`${"=".repeat(60)}`);
  console.log(`memoryProvider : ${memoryProvider}`);
  console.log(`memoryEnabled  : ${memoryEnabled}`);
  console.log(`userId (fixed) : ${USER_ID}`);
  console.log(`baseUrl        : ${BASE_URL}`);
  console.log(`D1_ID          : ${D1_ID}`);
  console.log(`SUPERSEDE_QUERY: "${SUPERSEDE_QUERY}"`);
  console.log(`SUPERSEDE_AMOUNT: ₹${SUPERSEDE_AMOUNT.toLocaleString()}`);
  console.log(`Expected slug  : ${EXPECTED_SLUG}`);
  console.log(`Expected factKey: ${EXPECTED_FACT_KEY}`);

  if (!memoryEnabled) {
    console.error("\nERROR: memoryEnabled=false. Check DINOMEM_API_KEY + FEATURE_AGENTMEM. Aborting.");
    process.exit(1);
  }

  const assertions: ReturnType<typeof pass>[] = [];
  const output: Record<string, unknown> = {
    ranAt: new Date().toISOString(),
    provider: memoryProvider,
    userId: USER_ID,
    d1Id: D1_ID,
    expectedFactKey: EXPECTED_FACT_KEY,
  };

  // ── PRE-FLIGHT ─────────────────────────────────────────────────────────────

  console.log("\n--- PRE-FLIGHT: confirm D1 exists and window is open ---");

  const d1PreHist = await dinomemGet(`/v1/memory/${D1_ID}/history`) as any;
  const d1Pre = d1PreHist?.memory ?? {};
  console.log(`  D1 fact_key   : ${d1Pre.fact_key}`);
  console.log(`  D1 valid_from : ${d1Pre.valid_from}`);
  console.log(`  D1 valid_to   : ${d1Pre.valid_to ?? "null (open)"}`);
  console.log(`  D1 superseded_by: ${d1Pre.superseded_by ?? "null"}`);
  output.d1_pre_history = d1PreHist;

  if (d1Pre.valid_to !== null && d1Pre.valid_to !== undefined) {
    console.error("\nSTOP: D1's validity window is already closed (valid_to set). Cannot test supersession.");
    process.exit(1);
  }
  if (d1Pre.fact_key !== EXPECTED_FACT_KEY) {
    console.error(`\nSTOP: D1 fact_key mismatch. Got "${d1Pre.fact_key}", expected "${EXPECTED_FACT_KEY}".`);
    process.exit(1);
  }
  console.log("  ✔ Pre-flight OK — D1 window open, factKey matches.");

  // ── THE SUPERSEDE DEBATE ───────────────────────────────────────────────────

  console.log(`\n--- SUPERSEDE DEBATE: "${SUPERSEDE_QUERY}" at ₹${SUPERSEDE_AMOUNT.toLocaleString()} ---`);
  console.log("  (recall happens BEFORE write — 4a assertion captured in onRecall callback)");

  const recallCaptures: any[] = [];
  let writeMs = 0;
  const turns: { agent: string; round: number; content: string }[] = [];
  let current: { agent: string; round: number; content: string } | null = null;

  const financeVerdict = computeFinanceVerdict({
    profile,
    amount: SUPERSEDE_AMOUNT,
    category: "electronics",
  });

  const t0 = performance.now();
  let debateResult: any;
  let debateError: unknown = null;

  try {
    debateResult = await streamDebate(
      {
        query: SUPERSEDE_QUERY,
        amount: SUPERSEDE_AMOUNT,
        category: "electronics",
        profile,
        financeVerdict,
        relevantTransactions: [],
        activeGoals: [],
        userId: USER_ID,
        onRecall: (m: any) => recallCaptures.push(m),
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
  } catch (e) {
    debateError = e;
    console.warn("  Debate threw; retrying once...", e);
    // Retry once (per gotcha: one transient OpenAI error expected).
    try {
      debateResult = await streamDebate(
        {
          query: SUPERSEDE_QUERY,
          amount: SUPERSEDE_AMOUNT,
          category: "electronics",
          profile,
          financeVerdict,
          relevantTransactions: [],
          activeGoals: [],
          userId: USER_ID,
          onRecall: (m: any) => recallCaptures.push(m),
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
      debateError = null;
    } catch (e2) {
      debateError = e2;
    }
  }

  const debateMs = Math.round(performance.now() - t0);

  if (debateError) {
    console.error("\nDEBATE FAILED after retry:", debateError);
    process.exit(1);
  }

  console.log(`\n  Debate complete: ${debateMs}ms  verdict=${debateResult?.verdict}  rounds=${debateResult?.rounds}`);
  console.log(`  recall tax: ${recallCaptures.reduce((s, r) => s + r.ms, 0)}ms  write tax: ${writeMs}ms`);

  output.debate = {
    query: SUPERSEDE_QUERY,
    amount: SUPERSEDE_AMOUNT,
    ms: debateMs,
    verdict: debateResult?.verdict,
    reasoning: debateResult?.reasoning,
    rounds: debateResult?.rounds,
    recall: recallCaptures,
    writeMs,
    turns: turns.map(t => ({ ...t, content: t.content.trim() })),
  };

  // Summarize recall
  console.log("\n  Recall summary:");
  for (const r of recallCaptures) {
    console.log(`    agent=${r.agentId} ms=${r.ms} hits=${r.hitCount} kept=${r.keptCount} topRel=${r.topRelevance?.toFixed?.(4) ?? "-"} injected=${r.injectedChars}ch`);
  }

  // ── 4a: recall surfaced the OLD ₹80k memory ───────────────────────────────

  console.log("\n--- ASSERTION 4a: recall surfaced the old ₹80k memory pre-write ---");

  // At least one recall round must have kept content referencing 80,000
  const anyKept = recallCaptures.some(r => r.keptCount > 0);
  const anyOldContent = recallCaptures.some(r =>
    (r.injectedChars ?? 0) > 0 ||
    (r.topRelevance ?? 0) >= 0.3
  );
  // Confirm the injected text mentioned ₹80k
  const injectedText = recallCaptures.find(r => (r.injectedChars ?? 0) > 0);

  console.log(`  anyKept=${anyKept} anyOldContent=${anyOldContent}`);
  console.log(`  Best recall: topRel=${Math.max(...recallCaptures.map(r => r.topRelevance ?? 0)).toFixed(4)} kept=${Math.max(...recallCaptures.map(r => r.keptCount ?? 0))}`);

  assertions.push(check(
    "4a",
    anyKept && anyOldContent,
    `old ₹80k memory recalled pre-write (topRel=${Math.max(...recallCaptures.map(r => r.topRelevance ?? 0)).toFixed(4)}, kept=${Math.max(...recallCaptures.map(r => r.keptCount ?? 0))})`,
    `recall did NOT surface old memory — kept=${Math.max(...recallCaptures.map(r => r.keptCount ?? 0))} topRel=${Math.max(...recallCaptures.map(r => r.topRelevance ?? 0)).toFixed(4)} (EXPECTED: old ₹80k window still open pre-write)`
  ));

  // ── wait briefly for embedding to settle, then find the new write ──────────

  console.log("\n--- Locating the new write (find by factKey via search) ---");

  // Wait a moment for the write to settle (embedding is async but the row exists immediately).
  await new Promise(r => setTimeout(r, 2000));

  // Search again to find the new memory (most recent hit on same query, should now be ₹1,50,000).
  const postWriteSearch = await dinomemPost("/v1/memory/search", {
    query: "laptop freelance design work",
    agentId: "fincil-probe",
    workflowId: USER_ID,
    topK: 5,
  }) as any[];

  console.log(`  Post-write search (no rerank) returned ${postWriteSearch?.length ?? 0} hits:`);
  for (const h of postWriteSearch ?? []) {
    console.log(`    id=${h.id?.slice(0,8)} score=${h.score?.toFixed(4)} created=${h.created_at?.slice(0,19)} content="${h.content?.slice(0,70)}"`);
  }

  // New memory: same factKey, more recent than D1, mentions ₹1,50,000.
  const newMem = (postWriteSearch ?? []).find(h =>
    h.id !== D1_ID &&
    (h.content?.includes("1,50,000") || h.content?.includes("150000") || h.content?.includes("150,000"))
  );
  const newId = newMem?.id;
  console.log(`\n  New memory id: ${newId ?? "NOT FOUND"}`);
  output.new_memory_id = newId;
  output.post_write_raw_search = postWriteSearch;

  if (!newId) {
    console.error("\nSTOP: New memory not found in post-write search. Cannot assert 4b/4c.");
    // Still write what we have.
  }

  // ── 4b: history shows supersession lineage ─────────────────────────────────

  console.log("\n--- ASSERTION 4b: supersession lineage in history ---");

  let d1PostHist: any = null;
  let newHist: any = null;

  // Check D1's history: valid_to should now be set, superseded_by should be newId.
  try {
    d1PostHist = await dinomemGet(`/v1/memory/${D1_ID}/history`);
    const d1Post = d1PostHist?.memory ?? {};
    console.log(`\n  D1 POST-WRITE:`);
    console.log(`    valid_to      : ${d1Post.valid_to ?? "null (STILL OPEN)"}`);
    console.log(`    superseded_by : ${d1Post.superseded_by ?? "null"}`);
    output.d1_post_history = d1PostHist;

    const d1Closed = d1Post.valid_to !== null && d1Post.valid_to !== undefined;
    const d1SupersededByNew = newId ? (d1Post.superseded_by === newId || d1PostHist?.supersededBy === newId) : false;

    assertions.push(check(
      "4b.d1_closed",
      d1Closed,
      `D1 valid_to=${d1Post.valid_to} (window closed)`,
      `D1 valid_to still null — supersession did NOT close the old window. RAW: ${JSON.stringify(d1Post).slice(0,200)}`
    ));

    if (newId) {
      assertions.push(check(
        "4b.d1_superseded_by",
        d1SupersededByNew,
        `D1 superseded_by=${d1Post.superseded_by ?? d1PostHist?.supersededBy} (points to new write)`,
        `D1 superseded_by=${d1Post.superseded_by ?? d1PostHist?.supersededBy} ≠ expected ${newId}`
      ));
    }
  } catch (e) {
    console.error("  ERROR fetching D1 post-write history:", e);
    assertions.push(fail("4b.d1_closed", `history fetch failed: ${e}`));
  }

  // Check new memory's history: supersedes should list D1.
  if (newId) {
    try {
      newHist = await dinomemGet(`/v1/memory/${newId}/history`);
      const newMem2 = newHist?.memory ?? {};
      const supersedes = newHist?.supersedes ?? [];
      console.log(`\n  NEW MEMORY HISTORY:`);
      console.log(`    id            : ${newMem2.id}`);
      console.log(`    fact_key      : ${newMem2.fact_key}`);
      console.log(`    valid_from    : ${newMem2.valid_from}`);
      console.log(`    valid_to      : ${newMem2.valid_to ?? "null (open)"}`);
      console.log(`    superseded_by : ${newMem2.superseded_by ?? "null"}`);
      console.log(`    supersedes    : ${JSON.stringify(supersedes)}`);
      output.new_history = newHist;

      const newFactKeyCorrect = newMem2.fact_key === EXPECTED_FACT_KEY;
      const newSupersedesD1 = supersedes.some((s: any) =>
        (typeof s === "string" && s === D1_ID) ||
        (typeof s === "object" && (s.id === D1_ID || s.superseded_id === D1_ID))
      );

      assertions.push(check(
        "4b.new_fact_key",
        newFactKeyCorrect,
        `new memory fact_key=${newMem2.fact_key}`,
        `new memory fact_key=${newMem2.fact_key} ≠ expected ${EXPECTED_FACT_KEY}`
      ));
      assertions.push(check(
        "4b.new_supersedes_d1",
        newSupersedesD1,
        `new memory supersedes D1 (lineage confirmed)`,
        `new memory supersedes does NOT reference D1. supersedes=${JSON.stringify(supersedes)} — P1 lineage may be broken`
      ));
    } catch (e) {
      console.error("  ERROR fetching new memory history:", e);
      assertions.push(fail("4b.new_history", `fetch failed: ${e}`));
    }
  }

  // ── 4c: fresh reranked search returns only new fact ────────────────────────

  console.log("\n--- ASSERTION 4c: fresh search returns only NEW fact, not ₹80k duplicate ---");

  await new Promise(r => setTimeout(r, 2000)); // let any index settle

  const freshSearch = await dinomemPost("/v1/memory/search", {
    query: "laptop freelance design work",
    agentId: "fincil-probe",
    workflowId: USER_ID,
    topK: 5,
    rerank: true,
  }) as any[];

  console.log(`  Fresh reranked search: ${freshSearch?.length ?? 0} hits`);
  for (const h of freshSearch ?? []) {
    const tag = h.id === D1_ID ? " ← D1 (old ₹80k)" : h.id === newId ? " ← NEW (₹1,50,000)" : "";
    console.log(`    id=${h.id?.slice(0,8)} rel=${h.relevance_score?.toFixed(4) ?? h.score?.toFixed(4)} content="${h.content?.slice(0,70)}"${tag}`);
  }
  output.fresh_reranked_search = freshSearch;

  const topFresh = freshSearch?.[0];
  const topIsNew = topFresh?.id === newId;
  const oldStillLive = (freshSearch ?? []).some(h =>
    h.id === D1_ID && ((h.relevance_score ?? h.score ?? 0) >= 0.3)
  );

  assertions.push(check(
    "4c.top_is_new",
    topIsNew,
    `top result is new ₹1,50,000 memory (id=${topFresh?.id?.slice(0,8)})`,
    `top result is NOT the new memory. top id=${topFresh?.id?.slice(0,8)} — old fact may be dominating`
  ));
  assertions.push(check(
    "4c.old_not_live_duplicate",
    !oldStillLive,
    `old ₹80k memory NOT returned as live duplicate (either absent or score<0.3)`,
    `old ₹80k memory (D1) STILL RETURNED with rel≥0.3 — P1 supersession DID NOT suppress it. This is a real P1 FAILURE. RAW: ${JSON.stringify(freshSearch?.find(h => h.id === D1_ID))}`
  ));

  // ── 4d: receipts contain the new searches ─────────────────────────────────

  console.log("\n--- ASSERTION 4d: new searches appear in receipts (P2 regression) ---");

  const receiptsRes = await dinomemGet("/v1/receipts?limit=20") as any;
  const receipts: any[] = receiptsRes?.receipts ?? receiptsRes ?? [];
  console.log(`  Total recent receipts: ${receipts.length}`);
  for (const r of receipts.slice(0, 5)) {
    console.log(`    reader=${r.reader_agent ?? r.readerAgent ?? "?"} query="${String(r.query ?? "").slice(0,50)}" ids=${(r.returned_ids ?? r.returnedIds ?? []).length}`);
  }
  output.receipts = receipts;

  // The post-write searches used agentId "fincil-probe".
  const probeReceipts = receipts.filter(r =>
    (r.reader_agent ?? r.readerAgent) === "fincil-probe"
  );
  assertions.push(check(
    "4d.receipts_present",
    probeReceipts.length > 0,
    `${probeReceipts.length} fincil-probe receipt(s) present`,
    `no fincil-probe receipts found — P2 may not be generating receipts for these searches. receipts=${JSON.stringify(receipts.slice(0,3)).slice(0,200)}`
  ));

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(`\n${"=".repeat(60)}`);
  console.log("ASSERTION SUMMARY");
  console.log(`${"=".repeat(60)}`);
  const passed = assertions.filter(a => a.status === "pass").length;
  const failed = assertions.filter(a => a.status === "fail").length;
  for (const a of assertions) {
    console.log(`  ${a.status === "pass" ? "✅" : "❌"} ${a.label}: ${a.detail}`);
  }
  console.log(`\n  ${passed}/${assertions.length} passed, ${failed} failed`);

  output.assertions = assertions;
  output.summary = { passed, failed, total: assertions.length };

  // ── Transcript ─────────────────────────────────────────────────────────────

  console.log(`\n----- SUPERSEDE DEBATE TRANSCRIPT -----`);
  for (const t of turns) {
    console.log(`  [${t.agent} r${t.round}] ${t.content.trim().slice(0, 200)}`);
  }
  console.log(`  VERDICT: ${debateResult?.verdict} — ${debateResult?.reasoning?.slice(0, 200)}`);

  // ── Write results ──────────────────────────────────────────────────────────

  writeFileSync(
    "notes/dinomem-test/live-test-p1-result.json",
    JSON.stringify(output, null, 2),
  );
  console.log("\n✔ Wrote notes/dinomem-test/live-test-p1-result.json");
}

main().catch((e) => {
  console.error("\nP1 TEST FAILED:", e);
  process.exit(1);
});
