import { z } from "zod";

/**
 * Server-only env. Validated at boot. Never expose to the client.
 * Add new keys here AND update .env.example so other devs know about them.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
});

/**
 * Public env. Must be prefixed NEXT_PUBLIC_ and is inlined into the JS bundle.
 * Treat as readable by anyone — never put secrets here.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

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
