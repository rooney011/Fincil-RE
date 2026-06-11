/**
 * Mem0 contradiction-handling test (the TODO's headline Mem0 question).
 *
 * Mem0 dedupes/updates via an LLM on write (infer:true). When personas assert
 * CONFLICTING facts across debates, does Mem0:
 *   (a) supersede the old memory (UPDATE event),
 *   (b) keep both (coexist), or
 *   (c) silently pick one?
 *
 * Two conflict shapes, both under one user_id with infer:true:
 *   A) Numeric contradiction — surplus ₹35,000 then "now ₹15,000".
 *   B) Miser-vs-Visionary recommendation conflict on the same purchase.
 *
 * After each write we poll getAll (extraction is async) and dump the memories +
 * their event history (ADD/UPDATE/DELETE) so we can see exactly what Mem0 did.
 *
 * Run: PATH=/tmp/node-v20.18.1-linux-x64/bin:$PATH node --import tsx notes/mem0-test/contradiction-test.mts
 */

import { readFileSync, writeFileSync } from "node:fs";

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

const USER = `mem0-contradiction-${Date.now()}`;
const log: any[] = [];

const getAll = async (): Promise<any[]> => {
  const res: any = await client.getAll({ filters: { AND: [{ user_id: USER }] } } as any);
  return Array.isArray(res) ? res : (res?.results ?? []);
};

/** Add (infer:true), then poll getAll until the memory count grows or ~35s passes. */
async function addAndSettle(label: string, messages: any[], prevCount: number): Promise<any[]> {
  console.log(`\n▶ ${label}`);
  const res: any = await client.add(messages, { userId: USER, agentId: "twin", infer: true });
  console.log(`  add → status=${res?.status ?? (Array.isArray(res) ? "SUCCEEDED" : "?")} eventId=${res?.eventId ?? "-"}`);
  let mems: any[] = [];
  for (let i = 1; i <= 8; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    mems = await getAll();
    console.log(`  +${i * 5}s → ${mems.length} memory(ies)`);
    if (mems.length !== prevCount) break;
  }
  for (const m of mems) console.log(`    • [${m.id?.slice(0, 8)}] ${m.memory}`);
  log.push({ step: label, count: mems.length, memories: mems.map((m) => ({ id: m.id, memory: m.memory })) });
  return mems;
}

/** Dump the event history (ADD/UPDATE/DELETE) for each current memory. */
async function dumpHistory(mems: any[], stepLabel: string) {
  console.log(`  -- event history (${stepLabel}) --`);
  for (const m of mems) {
    try {
      const h: any[] = await client.history(m.id);
      for (const e of h) {
        console.log(`    [${m.id?.slice(0, 8)}] ${e.event}: ${e.oldMemory ?? "∅"} → ${e.newMemory ?? "∅"}`);
      }
      log.push({ step: `${stepLabel}:history`, memoryId: m.id, history: h });
    } catch (e: any) {
      console.log(`    [${m.id?.slice(0, 8)}] history error: ${e?.message ?? e}`);
    }
  }
}

async function main() {
  console.log(`=== Mem0 contradiction test ===\nuser_id: ${USER}`);

  // --- A) numeric contradiction -------------------------------------------
  const a1 = await addAndSettle(
    "A1: state surplus ₹35,000",
    [{ role: "user", content: "My monthly surplus is ₹35,000." }],
    0,
  );
  const a2 = await addAndSettle(
    "A2: contradict — surplus is now ₹15,000",
    [{ role: "user", content: "Correction: my monthly surplus is now ₹15,000, not ₹35,000." }],
    a1.length,
  );
  await dumpHistory(a2, "A");
  console.log(
    `\n  → A result: ${a2.length} memory(ies) after the contradiction. ` +
      `${a2.length <= a1.length ? "Looks SUPERSEDED/MERGED." : "Both may COEXIST."}`,
  );

  // --- B) Miser-vs-Visionary recommendation conflict ----------------------
  const beforeB = (await getAll()).length;
  const b1 = await addAndSettle(
    "B1: Miser says DON'T buy",
    [
      { role: "user", content: "Should I buy the ₹80,000 laptop?" },
      { role: "assistant", content: "No — that ₹80,000 laptop is too risky; it threatens your emergency fund. You should not buy it." },
    ],
    beforeB,
  );
  const b2 = await addAndSettle(
    "B2: Visionary says DO buy (conflicts with B1)",
    [
      { role: "user", content: "Should I buy the ₹80,000 laptop?" },
      { role: "assistant", content: "Yes — buy the ₹80,000 laptop. It's a strategic investment that will grow your freelance income." },
    ],
    b1.length,
  );
  await dumpHistory(b2, "B");
  console.log(
    `\n  → B result: ${b2.length} memory(ies) total. Inspect whether the buy/don't-buy ` +
      `claims COEXIST, one was UPDATED over the other, or only one survived.`,
  );

  // --- final state ---------------------------------------------------------
  const finalMems = await getAll();
  console.log(`\n=== FINAL state: ${finalMems.length} memory(ies) for ${USER} ===`);
  finalMems.forEach((m) => console.log(`  • ${m.memory}`));

  const outPath = "notes/mem0-test/contradiction-test-result.json";
  writeFileSync(outPath, JSON.stringify({ ranAt: new Date().toISOString(), userId: USER, steps: log, final: finalMems }, null, 2));
  console.log(`\n✔ Wrote ${outPath}`);
}

main().catch((e) => { console.error("CONTRADICTION TEST FAILED:", e); process.exit(1); });
