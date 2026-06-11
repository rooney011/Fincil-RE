/**
 * pgvector capstone — N=3 stability + confabulation + voice bleed. Mirrors
 * notes/mem0-test/finish-test.mts (same seed, same 3 recall queries, same
 * heuristics) so the baseline floor lines up against Mem0 + AgentMem.
 *
 * Run: PATH=/tmp/node-v20.18.1-linux-x64/bin:$PATH node --import tsx notes/pgvector-test/finish-test.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

const raw = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) {
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
process.env.MEMORY_PROVIDER = "pgvector";
process.env.FEATURE_AGENTMEM = "true";

const { streamDebate } = await import("../../src/lib/ai/debate.ts");
const { computeFinanceVerdict } = await import("../../src/lib/finance/engine.ts");
const { recallMemories, memoryEnabled, memoryProvider } = await import("../../src/lib/ai/memory.ts");

const USER_ID = randomUUID();
const profile = {
  monthly_income: 80_000, monthly_expenses: 45_000, role: "freelancer" as const,
  risk_tolerance: "medium" as const, display_name: "Test User",
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
      onRecall: (m: any) => { recallMs = m.ms; kept = m.keptCount; }, onWrite: (m: any) => { writeMs = m.ms; } },
    (e: any) => { if (e.type === "agent") { cur = { agent: e.agent, round: e.round, content: "" }; turns.push(cur); } else if (e.type === "chunk" && cur) cur.content += e.text; },
  );
  return { query, amount, ms: Math.round(performance.now() - t0), recallMs, writeMs, kept, rounds: r.rounds, verdict: r.verdict,
    turns: turns.map((t) => ({ ...t, content: t.content.trim() })) };
}

async function main() {
  console.log(`memoryProvider=${memoryProvider} memoryEnabled=${memoryEnabled} minSim=${process.env.PGVECTOR_MIN_SIMILARITY ?? "(default 0)"}`);
  console.log(`user_id=${USER_ID}\n`);
  if (!memoryEnabled) { console.error("memoryEnabled FALSE — check Supabase creds + migration. Aborting."); process.exit(1); }

  console.log("seed debate (₹80,000)…");
  const seed = await runDebate("buy a new laptop for my freelance design work", 80_000);
  console.log(`  ${seed.ms}ms verdict=${seed.verdict}`);
  await new Promise((r) => setTimeout(r, 2000));

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
    const ctx = new Set([80_000, 45_000, 35_000, 300_000, amt, Math.round((amt * 1.05) / 12)]);
    const allowed = new Set([...memAmounts, ...ctx]);
    const histLines = d.turns.flatMap((t) =>
      t.content.split(/(?<=[.?!])\s+/).filter((s) => /last time|previously|earlier|before|approved|recall/i.test(s)).map((s) => ({ agent: t.agent, s })));
    const confab = histLines.flatMap(({ agent, s }) => amounts(s).filter((n) => !allowed.has(n)).map((n) => ({ agent, n, s })));
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
  const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
  console.log(`\n=== Stability (N=${runs.length}) ===`);
  console.log(`recall ms: ${recallMsList.join(", ")} (mean ${mean(recallMsList)}, p50 ${pct(recallMsList, 50)})`);
  console.log(`write ms:  ${writeMsList.join(", ")} (mean ${mean(writeMsList)}, p50 ${pct(writeMsList, 50)})`);
  console.log(`wall ms:   ${wallList.join(", ")} (mean ${mean(wallList)}, p50 ${pct(wallList, 50)})`);
  console.log(`memory tax/debate: ~${mean(recallMsList) + mean(writeMsList)}ms (${(((mean(recallMsList) + mean(writeMsList)) / mean(wallList)) * 100).toFixed(1)}% of wall)`);
  console.log(`total confab amounts across runs: ${runs.reduce((s, r) => s + r.confab.length, 0)}`);
  console.log(`total voice-bleed lines: ${runs.reduce((s, r) => s + r.bleedCount, 0)}`);

  writeFileSync("notes/pgvector-test/finish-test-result.json", JSON.stringify({ ranAt: new Date().toISOString(), provider: memoryProvider, userId: USER_ID, memText, seed, runs,
    stability: { recallMs: recallMsList, writeMs: writeMsList, wallMs: wallList, recallMean: mean(recallMsList), writeMean: mean(writeMsList), wallMean: mean(wallList) } }, null, 2));
  console.log(`\n✔ wrote notes/pgvector-test/finish-test-result.json`);
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
