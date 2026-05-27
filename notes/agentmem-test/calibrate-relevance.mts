/**
 * Block I calibration: where does relevance_score (rerank) put RELATED vs
 * UNRELATED queries against a stored laptop debate memory? Used to pick the
 * inject/drop threshold. Run:
 *   node --env-file=.env.local --import tsx notes/agentmem-test/calibrate-relevance.mts
 */
import { performance } from "node:perf_hooks";
import { MemoryStore } from "@agentmem/sdk";

const store = new MemoryStore({ apiKey: process.env.AGENTMEM_API_KEY! });
const wf = `agentmem-calib-${Date.now()}`;

const memory = [
  `On 2026-05-27, the user considered: "buy a new laptop for my freelance design work" — ₹80,000 (electronics).`,
  `Council verdict: APPROVED.`,
  `Financials then: monthly surplus ₹35,000, estimated EMI 20% of surplus, safety "safe-emi".`,
  `The Miser's closing concern: "₹10,000 last month for repairs is a clear sign of financial unpredictability."`,
  `The Visionary's closing case: "This laptop can enhance your efficiency and unlock higher-paying projects."`,
].join("\n");

await store.write({ content: memory, agentId: "twin", workflowId: wf, scope: "team", role: "observer" });
console.log(`seeded laptop memory in ${wf}; waiting 6s for extraction…`);
await new Promise((r) => setTimeout(r, 6000));

const queries: [string, string][] = [
  ["buy a new laptop for freelance work", "near-exact"],
  ["upgrade to a more powerful laptop", "related (Block K case)"],
  ["buy a mechanical keyboard", "same category (electronics)"],
  ["buy an ergonomic office chair for work", "work-related, diff category"],
  ["book a vacation to Goa", "unrelated"],
  ["should I get concert tickets this weekend", "unrelated"],
  ["invest in a mutual fund SIP", "unrelated (finance)"],
];

console.log(`\nquery → relevance_score (rerank) | raw score`);
for (const [q, kind] of queries) {
  const t = performance.now();
  const hits = await store.search({ query: q, agentId: "council", workflowId: wf, scope: "team", topK: 5, rerank: true });
  const ms = Math.round(performance.now() - t);
  const top = hits[0] as any;
  console.log(`  [${kind}] "${q}"`);
  console.log(`     rel=${top?.relevance_score?.toFixed?.(4) ?? "-"}  raw=${top?.score?.toFixed?.(4) ?? "-"}  (${ms}ms, ${hits.length} hits)`);
}
