import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const schema = z.object({
  amount: z
    .number()
    .nullable()
    .describe("The rupee amount mentioned, or null if none. Just the number."),
  confidence: z
    .enum(["high", "medium", "low", "none"])
    .describe(
      "How confident you are this represents income. 'none' if no income is mentioned at all.",
    ),
  recurring: z
    .boolean()
    .describe(
      "true if this is ongoing monthly income (raise, new job). false if one-time (prize, gift, bonus, side gig payout).",
    ),
});

export type IncomeExtraction = z.infer<typeof schema>;

const SYSTEM = `You are an income-extraction tool. The user has appealed a financial verdict and provided additional context. Identify any income they're claiming.

Examples:
- "I just got a raise to ₹85k/month" → { amount: 85000, confidence: "high", recurring: true }
- "I won a hackathon prize of ₹50k" → { amount: 50000, confidence: "high", recurring: false }
- "I have an extra ₹10000 this month from freelance" → { amount: 10000, confidence: "medium", recurring: false }
- "I started a new full-time job paying ₹80k" → { amount: 80000, confidence: "high", recurring: true }
- "I sold my old laptop for around 15k" → { amount: 15000, confidence: "medium", recurring: false }
- "It's important to me" (no amount) → { amount: null, confidence: "none", recurring: false }
- "I'll figure it out somehow" (no amount) → { amount: null, confidence: "none", recurring: false }

Rules:
- If no amount is mentioned at all, return amount: null, confidence: "none", recurring: false.
- If recurrence is unclear, lean recurring: false (one-time is the safer assumption).
- Strip ₹ symbols, commas, and "k"/"lakh" suffixes — return the raw integer (e.g., "50k" → 50000, "1 lakh" → 100000).`;

export async function extractIncome(
  appealText: string,
): Promise<IncomeExtraction> {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema,
      system: SYSTEM,
      prompt: appealText,
      temperature: 0,
    });
    return object;
  } catch (e) {
    console.warn("[extract-income] failed:", e);
    return { amount: null, confidence: "none", recurring: false };
  }
}
