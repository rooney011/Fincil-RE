/**
 * Capstone test — Block L (N=3 stability + confabulation) + Block J (voice bleed).
 *
 * Run with rerank OFF so memory is reliably injected regardless of rerank
 * rate-limit (the relevance gating itself is validated separately in Block I):
 *   AGENTMEM_RERANK=false AGENTMEM_MIN_RELEVANCE=0 \
 *     node --env-file=.env.local --import tsx notes/agentmem-test/finish-test.mts
 */
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { streamDebate } from "../../src/lib/ai/debate.ts";
import { computeFinanceVerdict } from "../../src/lib/finance/engine.ts";
import { recallMemories, memoryEnabled } from "../../src/lib/ai/memory.ts";

const USER_ID = `agentmem-finish-${Date.now()}`;
const profile = {
  monthly_income: 80_000,
  monthly_expenses: 45_000,
  role: "freelancer" as const,
  risk_tolerance: "medium" as const,
  display_name: "Test User",
  financial_goal: "Save ₹3,00,000 for an emergency fund",
};

const amounts = (s: string) =>
  [...s.matchAll(/₹\s?([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => n > 0);

async function runDebate(query: string, amount: number) {
  const financeVerdict = computeFinanceVerdict({ profile, amount, category: "electronics" });
  const turns: { agent: string; round: number; content: string }[] = [];
  let cur: any = null;
  let recallMs = 0, writeMs = 0, kept = 0;
  const t0 = performance.now();
  const r = await streamDebate(
    { query, amount, category: "electronics", profile, financeVerdict, relevantTransactions: [], activeGoals: [], userId: USER_ID,
      onRecall: (m) => { recallMs = m.ms; kept = m.keptCount; },
      onWrite: (m) => { writeMs = m.ms; } },
    (e: any) => { if (e.type === "agent") { cur = { agent: e.agent, round: e.round, content: "" }; turns.push(cur); } else if (e.type === "chunk" && cur) cur.content += e.text; },
  );
  return { query, amount, ms: Math.round(performance.now() - t0), recallMs, writeMs, kept, rounds: r.rounds, verdict: r.verdict,
    turns: turns.map((t) => ({ ...t, content: t.content.trim() })) };
}

async function main() {
  console.log(`memoryEnabled=${memoryEnabled} rerank=${process.env.AGENTMEM_RERANK} minRel=${process.env.AGENTMEM_MIN_RELEVANCE}`);
  console.log(`workflow=${USER_ID}\n`);

  console.log("seed debate (₹80,000)…");
  const seed = await runDebate("buy a new laptop for my freelance design work", 80_000);
  console.log(`  ${seed.ms}ms verdict=${seed.verdict}`);
  await new Promise((r) => setTimeout(r, 5000));

  // The memory now present (used as the confabulation baseline).
  const recalled = await recallMemories({ agentId: "council", userId: USER_ID, query: "laptop" });
  const memText = recalled.hits.map((h) => h.content).join("\n");
  const memAmounts = new Set(amounts(memText));
  console.log(`\nrecalled memory amounts: ${[...memAmounts].join(", ") || "(none — memory not injected!)"}`);

  const queries: [string, number][] = [
    ["upgrade to a more powerful laptop", 120_000],
    ["buy a ₹1,20,000 laptop for video editing", 120_000],
    ["replace my laptop with a high-end model", 110_000],
  ];

  const runs = [];
  for (const [q, amt] of queries) {
    console.log(`\nrecall debate: "${q}" (₹${amt})…`);
    const d = await runDebate(q, amt);
    // context amounts that are legitimately citable
    const ctx = new Set([80_000, 45_000, 35_000, 300_000, amt, Math.round((amt * 1.05) / 12)]);
    const allowed = new Set([...memAmounts, ...ctx]);
    // history-claim lines + confabulation check on them
    const histLines = d.turns.flatMap((t) =>
      t.content.split(/(?<=[.?!])\s+/).filter((s) => /last time|previously|earlier|before|approved|recall/i.test(s)).map((s) => ({ agent: t.agent, s })));
    const confab = histLines.flatMap(({ agent, s }) => amounts(s).filter((n) => !allowed.has(n)).map((n) => ({ agent, n, s })));
    // voice bleed: miser using visionary vocabulary in a history line, or vice versa
    const visVocab = /unlock|higher-paying|opportunit|trajectory|elevate|invest in your/i;
    const misVocab = /surplus|EMI|emergency fund|repair|cushion|% of/i;
    const bleed = histLines.filter(({ agent, s }) => (agent === "miser" && visVocab.test(s) && !misVocab.test(s)) || (agent === "visionary" && /that ₹[\d,]+ EMI consumes/i.test(s)));
    console.log(`  ${d.ms}ms verdict=${d.verdict} kept=${d.kept} | history-claim lines=${histLines.length} confab-amounts=${confab.length} bleed=${bleed.length}`);
    histLines.slice(0, 3).forEach(({ agent, s }) => console.log(`    [${agent}] ${s.trim().slice(0, 110)}`));
    if (confab.length) confab.forEach((c) => console.log(`    ⚠ CONFAB [${c.agent}] ₹${c.n}: ${c.s.trim().slice(0, 90)}`));
    runs.push({ ...d, histLineCount: histLines.length, confab, bleedCount: bleed.length });
  }

  const recallMsList = runs.map((r) => r.recallMs);
  const writeMsList = runs.map((r) => r.writeMs);
  const wallList = runs.map((r) => r.ms);
  const mean = (a: number[]) => Math.round(a.reduce((s, x) => s + x, 0) / a.length);
  console.log(`\n=== Block L stability (N=${runs.length}) ===`);
  console.log(`recall ms: ${recallMsList.join(", ")} (mean ${mean(recallMsList)})`);
  console.log(`write ms:  ${writeMsList.join(", ")} (mean ${mean(writeMsList)})`);
  console.log(`wall ms:   ${wallList.join(", ")} (mean ${mean(wallList)})`);
  console.log(`total confab amounts across runs: ${runs.reduce((s, r) => s + r.confab.length, 0)}`);
  console.log(`total voice-bleed lines: ${runs.reduce((s, r) => s + r.bleedCount, 0)}`);

  writeFileSync("notes/agentmem-test/finish-test-result.json", JSON.stringify({ ranAt: new Date().toISOString(), userId: USER_ID, memText, seed, runs }, null, 2));
  console.log(`\n✔ wrote notes/agentmem-test/finish-test-result.json`);
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
