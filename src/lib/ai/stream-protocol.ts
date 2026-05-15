/**
 * SSE protocol for /api/debate.
 *
 * Server encodes one event per `data:` block. Client splits on `\n\n`,
 * parses each JSON payload, and dispatches by `type`.
 *
 * Order of events for a normal debate:
 *   meta → (agent → chunk×N)+ → verdict → done
 * Trivial purchases short-circuit:
 *   meta → verdict → done
 * Errors:
 *   ... → error → done
 */

import type { FinanceVerdict } from "@/lib/finance/engine";

export type StreamEvent =
  | {
      type: "meta";
      financeVerdict: FinanceVerdict;
    }
  | {
      type: "agent";
      agent: "miser" | "visionary";
      round: number;
    }
  | {
      type: "chunk";
      text: string;
    }
  | {
      type: "verdict";
      verdict: "approved" | "rejected";
      reasoning: string;
      sessionId: string | null;
      rounds: number;
    }
  | {
      type: "error";
      error: string;
    }
  | { type: "done" };

const SSE_DELIM = "\n\n";

/**
 * Server-side: build the bytes for a single SSE event.
 */
export function encodeEvent(event: StreamEvent): Uint8Array {
  const json = JSON.stringify(event);
  return new TextEncoder().encode(`data: ${json}${SSE_DELIM}`);
}

/**
 * Client-side: stateful decoder for an SSE byte stream.
 * Buffers partial chunks across reads, yields complete events.
 */
export class StreamEventDecoder {
  private buffer = "";
  private decoder = new TextDecoder();

  push(chunk: Uint8Array): StreamEvent[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.drain();
  }

  flush(): StreamEvent[] {
    this.buffer += this.decoder.decode();
    return this.drain();
  }

  private drain(): StreamEvent[] {
    const events: StreamEvent[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf(SSE_DELIM)) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + SSE_DELIM.length);
      const ev = parseBlock(block);
      if (ev) events.push(ev);
    }
    return events;
  }
}

function parseBlock(block: string): StreamEvent | null {
  // Each block is a series of `field: value` lines. We only care about `data:`.
  const lines = block.split("\n");
  const dataLines = lines
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n");
  try {
    return JSON.parse(payload) as StreamEvent;
  } catch {
    return null;
  }
}
