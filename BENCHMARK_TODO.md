# AgentMem — Fincil Benchmark TODO

**Created:** 2026-06-04
**Goal:** Benchmark AgentMem against competing memory systems by integrating each
into **Fincil** (the 3-persona debate app: Miser / Visionary / Twin; TypeScript +
Vercel AI SDK) and running the same debate scenarios, then comparing quality,
latency, cost, and multi-agent behaviour against AgentMem's already-captured numbers.

> This is the **app-level** benchmark (real app, real flow). It complements — does
> not replace — the synthetic scenario harness in `agentmem-bench/DESIGN.md`
> (S1–S7). Fincil is the right vehicle because a debate naturally produces
> contradictions across personas and relies on cross-session recall — exactly the
> multi-agent dimension LoCoMo/LongMemEval miss.

AgentMem is already integrated on Fincil via `@agentmem/vercel-ai-provider`
(branch `scratch/agentmem-test`; notes in `D:\agentmem\notes\agentmem-test\`).
Reuse that harness as the template for every other system.

---

## Access legend (the free-vs-paid answer)

| Tag | Meaning |
|---|---|
| 🟢 FREE | Free OSS self-host and/or a genuinely free hosted key. No card needed. |
| 🟡 FREE TIER | Free tier is enough for small Fincil runs; **paid beyond limits** — watch usage. |
| 🔴 PAID / VERIFY | No clear free path, or access/pricing unconfirmed. Defer. |

---

## Candidate systems — access, Fincil fit, priority

| # | System | Access | Fits Fincil (TS / Vercel AI SDK)? | What it best tests | Priority |
|---|---|---|---|---|---|
| — | **AgentMem** | 🟢 own | ✅ done (`@agentmem/vercel-ai-provider`) | baseline (already measured) | done |
| 1 | **Mem0** | 🟢 FREE (OSS + hosted free tier) | ✅ has `@mem0/vercel-ai-provider` — drops in like AgentMem | the category-leader head-to-head | **first** |
| 2 | **pgvector baseline** | 🟢 FREE (just Supabase) | ✅ trivial — a table + cosine `SELECT TOP K` | the floor: does any memory system beat raw vector search? | **first** |
| 3 | **Supermemory** | 🟡 FREE TIER (verify dev limits) | ✅ first-party TS SDK | closest analogue — DX + recall quality head-to-head | high |
| 4 | **Zep** | 🟡 FREE TIER ($25/10K credits after) | ✅ `@getzep/zep-cloud` TS SDK | temporal validity + contradiction handling | high |
| 5 | **Cognee** | 🟢 FREE (OSS self-host, SQLite+LanceDB+Kuzu) | ⚠️ Python-first / REST — needs a local service + glue from TS | graph-first recall | medium |
| 6 | **LangMem** | 🟢 FREE (OSS) | ❌ Python + LangGraph lock-in — integration mismatch | semantic/episodic/procedural floor | low / optional |
| — | **ByteRover 2.0** | 🔴 PAID/VERIFY | ❓ | claims 92.2% LoCoMo | defer |
| — | **MemMachine** | 🔴 VERIFY (maybe OSS) | ❓ | claims 0.9169 LoCoMo | defer |
| — | **Letta (Cloud)** | 🔴 paid cloud / 🟢 OSS self-host | ❌ drifted to Letta Code; not a clean memory API | — | defer |

**Recommended order to test on Fincil:** `Mem0 → pgvector → Supermemory → Zep → Cognee → (LangMem optional)`.
Rationale: the first two are free + trivial to wire (Mem0 has a Vercel AI provider; pgvector is just Supabase). Supermemory + Zep are free-tier and have TS SDKs. Cognee/LangMem are Python and need glue, so they come last.

---

## What we measure (same for every system)

Capture these per system, on the **same** debate scenarios AgentMem was tested on:

- **Recall quality** — does the right persona reference the right memory? (Reuse the dogfood learning: put recalled memory in the *task* prompt, not the system prompt.)
- **Latency overhead** — per debate. AgentMem baselines: ~8% overhead; ~11s if recalling every turn; ~1.3s with once-per-debate recall.
- **Cost** — $ per 1k writes and per 1k searches (extraction LLM + embeddings + storage).
- **Multi-agent behaviour:**
  - Contradiction handling when personas assert conflicting facts (does the system surface/resolve, or silently pick one?).
  - Cross-persona "voice bleed" under team scope (AgentMem: 0 bleed at N=3).
- **DX / integration effort** — subjective notes (setup time, SDK ergonomics, footguns).
- **Failures / quirks** — anything that breaks or silently degrades (cf. AgentMem's rerank silent-degrade bug).

---

## Parity rules (so the comparison is fair) — from `agentmem-bench/DESIGN.md` §9

- [ ] Same Fincil debate scripts + fixed seeds across all systems.
- [ ] Embeddings: use **each system's default** (that's the real out-of-box experience) and **document** the model per system in its result sheet.
- [ ] Pin every LLM/embedding model to a version string — no `latest`.
- [ ] Same `top_k` and recall cadence (once-per-debate) across systems.
- [ ] Pre-flight cost estimate; keep the whole sweep cheap (target < $30 total, mirror the harness budget cap).
- [ ] Record raw outputs (per-debate transcripts + memory hits) so numbers are reproducible.

---

## Per-system checklist (repeat for each)

Copy this block per system as you go.

### 1. Mem0 — 🟢 FREE — FIRST
- [ ] Get access: `npm i mem0ai @mem0/vercel-ai-provider` (OSS self-host) OR grab a hosted free-tier API key.
- [ ] Write a Fincil adapter mirroring the `@agentmem/vercel-ai-provider` integration (same recall splice point).
- [ ] Run the standard debate set (same seeds).
- [ ] Record metric sheet (below).
- [ ] Note contradiction handling — Mem0 dedupes via LLM; capture how it resolves Miser-vs-Visionary conflicts.

### 2. pgvector baseline — 🟢 FREE — FIRST
- [ ] New table in Fincil's Supabase: `embedding vector`, cosine-similarity `SELECT ... ORDER BY embedding <=> $q LIMIT k`. No extraction, no dedup.
- [ ] Wire write/recall into the debate flow.
- [ ] Run + record. This is the floor — if a system can't beat this on Fincil, that scenario isn't measuring memory value.

### 3. Supermemory — 🟡 FREE TIER (verify limits)
- [ ] Sign up, confirm the free dev tier actually exists + its limits. **If it requires a card / has no free tier → mark 🔴 and defer.**
- [ ] `npm i supermemory`, wire TS SDK into Fincil.
- [ ] Run + record. This is the closest analogue — pay attention to DX parity.

### 4. Zep — 🟡 FREE TIER ($25/10K credits beyond)
- [ ] Create a Zep Cloud free-tier key (or self-host Graphiti for a fully free path).
- [ ] `@getzep/zep-cloud` into Fincil.
- [ ] Run + record; watch credit burn (small Fincil runs should stay in free tier).

### 5. Cognee — 🟢 FREE (self-host)
- [ ] Stand up Cognee locally (zero-infra: SQLite+LanceDB+Kuzu) behind a small local HTTP shim.
- [ ] Call it from Fincil (TS → local REST). Higher glue cost — budget for it.
- [ ] Run + record.

### 6. LangMem — 🟢 FREE — OPTIONAL
- [ ] Only if time allows: Python + LangGraph; doesn't fit the TS/Vercel-AI flow cleanly.
- [ ] If skipped, note it explicitly (don't silently drop a system).

---

## Metric sheet template (one per system)

```
System:            <name>            Version: <pin>
Access:            🟢/🟡/🔴
Embeddings/LLM:    <model + version>   (each system's default)
Recall quality:    <hit rate / qualitative>   (AgentMem ref: referenced every turn when spliced into task prompt)
Latency/debate:    p50 __ms  p95 __ms   overhead __%   (AgentMem ref: ~8% / ~1.3s once-per-debate)
Cost:              $__/1k writes   $__/1k searches
Contradiction:     surfaced? resolved? silent-pick?
Voice bleed (N=3): __ / __        (AgentMem ref: 0)
DX notes:          <setup time, SDK ergonomics, footguns>
Failures/quirks:   <anything that broke or silently degraded>
Raw outputs:       <path to transcripts + hits>
```

---

## Open items to verify before/while running

- [ ] **Supermemory free tier** — confirm it exists and its limits (PDF didn't state pricing). Reclassify 🟡→🔴 if not free.
- [ ] **ByteRover 2.0 / MemMachine** — check if either has a free OSS path or public API; if so promote out of "defer".
- [ ] Decide whether to also run the same systems through the synthetic `agentmem-bench` S1–S7 (more rigorous, but more build work) once the Fincil sweep gives a quick read.

---

## Cost summary (the short answer)

- **Free, do these first:** AgentMem (done), **Mem0**, **pgvector**, Cognee, LangMem.
- **Free tier, fine for small Fincil runs (don't blow past limits):** **Zep**, **Supermemory** (verify).
- **Paid / unconfirmed — skip for now:** ByteRover 2.0, MemMachine, Letta Cloud.
