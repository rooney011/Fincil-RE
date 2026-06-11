/**
 * Mem0 storage probe — why did the live test store 0 memories?
 *
 * Isolates three things against the hosted Mem0 API directly (no debate flow):
 *   A) infer:false (verbatim) round-trip — does add→search work + what's the score scale?
 *   B) infer:true (LLM extraction) — does it store anything, and is it ASYNC
 *      (returns empty immediately, lands later)? We poll search for ~25s.
 *   C) the search filter shape — confirm { AND: [{ user_id }] } returns our writes.
 *
 * Run: PATH=/tmp/node-v20.18.1-linux-x64/bin:$PATH node --import tsx notes/mem0-test/probe.mts
 */

import { readFileSync } from "node:fs";

// self-load .env.local
const raw = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) {
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const { default: MemoryClient } = await import("mem0ai");
const client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });

const summary =
  `On 2026-06-11, the user considered: "buy a new laptop for my freelance design work" — ₹80,000 (electronics).\n` +
  `Council verdict: APPROVED.\n` +
  `Financials then: monthly surplus ₹35,000, estimated EMI 20% of surplus, safety "manageable".\n` +
  `The Miser's closing concern: "A ₹7,000 EMI could tighten your surplus if another surprise arises."\n` +
  `The Visionary's closing case: "The laptop is a strategic investment that can attract higher-paying clients."`;

const search = async (user: string, query: string) => {
  const res: any = await client.search(query, { filters: { AND: [{ user_id: user }] }, topK: 5 });
  const hits: any[] = Array.isArray(res) ? res : (res?.results ?? []);
  return hits;
};

async function main() {
  console.log("=== A) infer:false (verbatim) ===");
  const uA = `probe-verbatim-${Date.now()}`;
  const addA: any = await client.add([{ role: "assistant", content: summary }], {
    userId: uA, agentId: "twin", infer: false, metadata: { kind: "debate-verdict" },
  });
  console.log("add(infer:false) raw response:");
  console.log(JSON.stringify(addA, null, 2).slice(0, 1500));
  await new Promise((r) => setTimeout(r, 2500));
  const hitsA = await search(uA, "should I buy a laptop");
  console.log(`search → ${hitsA.length} hit(s):`);
  hitsA.forEach((h) => console.log(`  [${h.score?.toFixed?.(4)}] (${h.agent_id ?? "?"}) ${(h.memory ?? "").slice(0, 120)}`));

  console.log("\n=== B) infer:true (extraction), poll search up to ~25s ===");
  const uB = `probe-infer-${Date.now()}`;
  const addB: any = await client.add([{ role: "assistant", content: summary }], {
    userId: uB, agentId: "twin", infer: true, metadata: { kind: "debate-verdict" },
  });
  console.log("add(infer:true) raw response:");
  console.log(JSON.stringify(addB, null, 2).slice(0, 1500));
  for (let i = 1; i <= 5; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const hitsB = await search(uB, "should I buy a laptop");
    console.log(`  +${i * 5}s → ${hitsB.length} hit(s)` + (hitsB.length ? ":" : ""));
    hitsB.forEach((h) => console.log(`    [${h.score?.toFixed?.(4)}] ${(h.memory ?? "").slice(0, 120)}`));
    if (hitsB.length) break;
  }

  console.log("\n=== C) infer:true with a first-person 'user' message ===");
  const uC = `probe-userrole-${Date.now()}`;
  const addC: any = await client.add(
    [
      { role: "user", content: "I want to buy a new ₹80,000 laptop for my freelance design work." },
      { role: "assistant", content: "The council APPROVED it: the ₹7,000 EMI is ~20% of your ₹35,000 surplus, manageable. The Miser warned about surprise expenses; the Visionary called it a strategic investment for higher-paying clients." },
    ],
    { userId: uC, agentId: "twin", infer: true },
  );
  console.log("add(user+assistant, infer:true) raw response:");
  console.log(JSON.stringify(addC, null, 2).slice(0, 1500));
  for (let i = 1; i <= 4; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const hitsC = await search(uC, "should I buy a laptop");
    console.log(`  +${i * 5}s → ${hitsC.length} hit(s)` + (hitsC.length ? ":" : ""));
    hitsC.forEach((h) => console.log(`    [${h.score?.toFixed?.(4)}] ${(h.memory ?? "").slice(0, 120)}`));
    if (hitsC.length) break;
  }
}

main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });
