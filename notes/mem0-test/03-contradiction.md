# Mem0 — Iteration 03: Contradiction handling (infer:true)

**Date:** 2026-06-11
**Script:** `notes/mem0-test/contradiction-test.mts`
**Raw:** `notes/mem0-test/contradiction-test-result.json`
**Question (from BENCHMARK_TODO):** when personas assert conflicting facts, does
Mem0 surface/resolve the conflict, or silently pick one? Mem0 dedupes via an LLM
on write (`infer:true`) — this tests whether that dedup actually fires.

## Setup

One `user_id`, `infer:true`. Two conflict shapes, polling `getAll` after each
write (extraction is async) and reading each memory's `history` for ADD/UPDATE/DELETE.

## A) Numeric contradiction: surplus ₹35,000 → "now ₹15,000"

| Write | Resulting memory | Event |
|---|---|---|
| A1 "My monthly surplus is ₹35,000." | `User's monthly financial surplus is ₹35,000` (landed ~**30s** later) | ADD |
| A2 "Correction: …now ₹15,000, not ₹35,000." | `Correction's monthly financial surplus is ₹15,000, updated from the previous ₹35,000` (NEW memory) | ADD |

**Result: BOTH coexist (2 live memories).** No UPDATE/DELETE fired — the stale
₹35,000 memory was *not* superseded. A later search can surface either value.

Two notable sub-findings:
- **Extraction garble blocked the dedup.** A2 became `"Correction's monthly
  financial surplus…"` — the extractor mis-parsed the literal "Correction:" prefix
  as the subject/owner. Because the two memories no longer share a clean subject
  ("User's …" vs "Correction's …"), Mem0's dedup didn't recognize them as the same
  attribute, so it ADDed instead of UPDATEd. Fragile: contradiction resolution
  depends on the extractor parsing the subject consistently.
- **Async + slow.** The first memory took ~30s to land; a debate that writes then
  immediately recalls (as Fincil does) would miss it entirely with `infer:true`.

## B) Miser-vs-Visionary recommendation conflict

| Write | Resulting memory |
|---|---|
| B1 user asks + **Miser: "No, don't buy the ₹80,000 laptop, too risky"** | `User is contemplating buying a laptop priced at ₹80,000, asking whether the purchase is advisable.` |
| B2 user asks + **Visionary: "Yes, buy it, strategic investment"** | *(nothing new — count stayed 3 for 40s)* |

**Result: the persona recommendations were never stored.** Mem0's extraction is
**user-fact-centric** — it captured the user's *question/intent* and dropped both
assistant *recommendations*. So the Miser-vs-Visionary opinion conflict isn't even
represented as competing facts; B2 deduped to a no-op against the B1 intent fact.

## Verdict on contradiction handling (out-of-box)

> Mem0 **neither surfaces nor resolves** the conflicts in default config. The
> numeric contradiction **silently coexists** (both values live — arguably the
> worst outcome: a stale fact remains recallable), and conflicting persona
> *opinions* aren't captured at all (only the neutral user intent survives).

This is the opposite of what "LLM dedup resolves conflicts" implies for this
workload. For Fincil specifically it means `infer:true` is a poor fit: slow,
async, drops the persona arguments that make the debate interesting, and can
leave contradictory financial facts side by side.

### Fair caveats (not pursued — out of scope for an out-of-box run)
- Mem0 has tuning that could change this: `customInstructions`/`customCategories`
  to steer extraction, `latestOnly` on search to prefer the newest, the v3 linked
  supersession chain (`deleteLinked`), and Memory Decay (down-weights stale hits
  at rank time). None are on by default.
- A cleaner write phrasing (no "Correction:" prefix) might let the dedup fire an
  UPDATE. The fragility itself is the finding.

## Implication for the benchmark

- Keep the **main recall/latency benchmark on `infer:false`** (verbatim) — it's
  faithful, synchronous, and apples-to-apples with AgentMem (iteration 02).
- Record `infer:true` as a **distinct behavior**, not the default: Mem0's
  signature LLM extraction/dedup did not provide reliable contradiction resolution
  here and is ill-suited to Fincil's write-then-immediately-recall debate loop.
