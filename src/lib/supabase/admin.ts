import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/db/types";

/**
 * Server-only admin Supabase client. Uses the SERVICE_ROLE key and therefore
 * bypasses Row Level Security.
 *
 * Use ONLY for narrowly-scoped, server-side reads of data we explicitly want
 * to expose to unauthenticated visitors (e.g. /share/[sessionId] public OG
 * pages). Never expose to a client component, route handler that takes user
 * input as a row key without further sanitization, or any code path the
 * browser can reach.
 */
export function createAdminClient() {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing — admin client unavailable.",
    );
  }
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
