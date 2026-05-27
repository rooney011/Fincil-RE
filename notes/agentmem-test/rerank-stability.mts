import { performance } from "node:perf_hooks";
import { MemoryStore } from "@agentmem/sdk";
const wf = process.argv[2];
const store = new MemoryStore({ apiKey: process.env.AGENTMEM_API_KEY! });
const q = "upgrade to a more powerful laptop";
for (let i = 1; i <= 5; i++) {
  const t = performance.now();
  const hits = await store.search({ query: q, agentId: "council", workflowId: wf, scope: "team", topK: 3, rerank: true });
  const ms = Math.round(performance.now() - t);
  const rels = hits.map((h:any)=>h.relevance_score?.toFixed?.(3) ?? "-").join(", ");
  console.log(`run ${i}: ${ms}ms, ${hits.length} hits, relevance=[${rels}]`);
  await new Promise(r=>setTimeout(r,500));
}
