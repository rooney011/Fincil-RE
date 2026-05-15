/**
 * Generated DB types — placeholder until we generate real ones from Supabase.
 *
 * Regenerate once we have the CLI hooked up:
 *   pnpm supabase gen types typescript --project-id <id> > src/lib/db/types.ts
 *
 * Until then, this permissive shape satisfies @supabase/ssr's GenericSchema
 * constraint so .from(...).insert/select/update typecheck without complaints.
 * It trades type safety for unblocked development; flag that we owe a regen.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type AnyRow = Record<string, unknown>;

type AnyTable = {
  Row: AnyRow;
  Insert: AnyRow;
  Update: AnyRow;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: Record<string, AnyTable>;
    Views: Record<string, { Row: AnyRow; Relationships: [] }>;
    Functions: Record<
      string,
      {
        Args: AnyRow;
        Returns: unknown;
      }
    >;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, AnyRow>;
  };
};
