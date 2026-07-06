import { z } from "zod";

/**
 * Server-only env. Validated at boot. Never expose to the client.
 * Add new keys here AND update .env.example so other devs know about them.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  // Optional: only required when FEATURE_AGENTMEM is on. Validated lazily by the
  // debate flow, not at boot, so the app still starts without a memory key.
  // Which key matters depends on MEMORY_PROVIDER (agentmem → AGENTMEM_API_KEY,
  // mem0 → MEM0_API_KEY, dinomem → DINOMEM_API_KEY). All optional.
  AGENTMEM_API_KEY: z.string().min(1).optional(),
  MEM0_API_KEY: z.string().min(1).optional(),
  DINOMEM_API_KEY: z.string().min(1).optional(),
});

/**
 * Public env. Must be prefixed NEXT_PUBLIC_ and is inlined into the JS bundle.
 * Treat as readable by anyone — never put secrets here.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** "true"/"1"/"yes" → true; "false"/"0"/"no" → false; missing → default. */
function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return fallback;
}

/**
 * Feature flags. Read on both server and client.
 *
 * - `share`: gates the public /share/[sessionId] page + the Share button on
 *   the council verdict card. Default ON. Flip off if you want to remove
 *   public exposure while iterating.
 * - `nudges`: gates the LLM-backed dashboard nudge generator. Default ON.
 *   Flip off to immediately stop OpenAI calls on /dashboard. The static
 *   "This week" card stays.
 * - `agentmem`: gates the AgentMem memory layer on the council debate.
 *   Default OFF (experimental). Effective only when AGENTMEM_API_KEY is also
 *   set — the debate flow degrades gracefully to no-memory if the key is
 *   missing, so flipping this on without a key is a no-op, not a crash.
 */
export const features = {
  share: parseBoolEnv(process.env.NEXT_PUBLIC_FEATURE_SHARE, true),
  nudges: parseBoolEnv(process.env.FEATURE_NUDGES, true),
  agentmem: parseBoolEnv(process.env.FEATURE_AGENTMEM, false),
};

function parseEnv() {
  const isServer = typeof window === "undefined";

  const publicEnv = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!publicEnv.success) {
    const flat = z.flattenError(publicEnv.error);
    throw new Error(
      `Invalid public env vars:\n${JSON.stringify(flat.fieldErrors, null, 2)}`,
    );
  }

  if (!isServer) {
    return { ...publicEnv.data } as Env;
  }

  const serverEnv = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    AGENTMEM_API_KEY: process.env.AGENTMEM_API_KEY,
    MEM0_API_KEY: process.env.MEM0_API_KEY,
    DINOMEM_API_KEY: process.env.DINOMEM_API_KEY,
  });

  if (!serverEnv.success) {
    const flat = z.flattenError(serverEnv.error);
    throw new Error(
      `Invalid server env vars:\n${JSON.stringify(flat.fieldErrors, null, 2)}`,
    );
  }

  return { ...publicEnv.data, ...serverEnv.data } as Env;
}

export type Env = z.infer<typeof publicSchema> &
  Partial<z.infer<typeof serverSchema>>;

export const env = parseEnv();
