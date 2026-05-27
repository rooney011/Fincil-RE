import { performance } from "node:perf_hooks";
import { MemoryStore } from "@agentmem/sdk";
const wf = process.argv[2];
const store = new MemoryStore({ apiKey: process.env.AGENTMEM_API_KEY! });
const q = "upgrade to a more powerful laptop";
for (const rerank of [false, true]) {
  const t = performance.now();
  const hits = await store.search({ query: q, agentId: "miser", workflowId: wf, scope: "team", topK: 5, rerank });
  console.log(`\nrerank=${rerank}  (${Math.round(performance.now()-t)}ms, ${hits.length} hits)`);
  hits.forEach((h:any)=>console.log(`  score=${h.score?.toFixed?.(4)} rel=${h.relevance_score?.toFixed?.(4) ?? "-"}  ${h.content.slice(0,70)}…`));
}
