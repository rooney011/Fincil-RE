import { recallMemories } from "../../src/lib/ai/memory.ts";
const wf = process.argv[2];
const cases = [
  ["upgrade to a more powerful laptop", "related → expect KEPT"],
  ["book a 2-week vacation to Europe", "unrelated → expect DROPPED"],
  ["should I buy concert tickets", "unrelated → expect DROPPED"],
  ["buy a mechanical keyboard", "same-category → expect DROPPED (0.1<0.3)"],
];
for (const [q, expect] of cases) {
  const r = await recallMemories({ agentId: "council", userId: wf, query: q });
  console.log(`\n"${q}"  [${expect}]`);
  console.log(`   hits=${r.hitCount} kept=${r.keptCount} topRel=${r.topRelevance?.toFixed?.(4) ?? "-"} injected=${r.text.length>0?"YES":"no"}`);
}
