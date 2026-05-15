import { embed } from "ai";
import { google } from "@ai-sdk/google";

// Schema-locked at 768 (see supabase/migrations/.../init.sql — `vector(768)`).
// Changing this requires a migration to widen the column.
// gemini-embedding-001 supports configurable outputDimensionality; 768 is valid.
const MODEL_ID = "gemini-embedding-001";
const EMBED_DIMS = 768;

/**
 * Embed a transaction or document for storage. Use this when writing rows
 * that will later be retrieved via vector search.
 */
export async function embedDocument(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: google.embeddingModel(MODEL_ID),
    value: text,
    providerOptions: {
      google: {
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: EMBED_DIMS,
      },
    },
  });
  return embedding;
}

/**
 * Embed a user query for retrieval. Different task type from documents —
 * Gemini's embedding space is tuned per-task.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: google.embeddingModel(MODEL_ID),
    value: text,
    providerOptions: {
      google: {
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBED_DIMS,
      },
    },
  });
  return embedding;
}
