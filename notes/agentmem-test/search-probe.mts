import { performance } from "node:perf_hooks";
import { MemoryStore } from "@agentmem/sdk";
const wf = process.argv[2];
const store = new MemoryStore({ apiKey: process.env.AGENTMEM_API_KEY! });
for (const q of ["should I buy a laptop", "laptop purchase for freelance work", "did the council approve a laptop before"]) {
  const t = performance.now();
  const hits = await store.search({ query: q, agentId: "miser", workflowId: wf, scope: "team", topK: 5 });
  console.log(`\nQ: "${q}"  (${Math.round(performance.now()-t)}ms, ${hits.length} hits)`);
  hits.forEach((h:any)=>console.log(`  [score=${h.score?.toFixed?.(4)} rel=${h.relevance_score ?? "-"}] ${h.content.slice(0,90)}…`));
}
