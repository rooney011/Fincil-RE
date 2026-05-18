/**
 * Pure-TS finance pre-engine.
 *
 * Runs BEFORE any LLM call. Computes deterministic facts (surplus, EMI,
 * safety category) and a human-readable mathVerdict string. The agents
 * receive this verdict as ground truth and debate the *why*, not the math.
 *
 * No imports, no side effects, no randomness — fully testable.
 */

export type Role =
  | "student"
  | "freelancer"
  | "employee"
  | "business"
  | "general";

export type RiskTolerance = "low" | "medium" | "high";

export type ProfileForEngine = {
  monthly_income: number;
  monthly_expenses: number;
  role: Role;
  risk_tolerance: RiskTolerance;
};

export type FinanceInput = {
  profile: ProfileForEngine;
  amount: number; // positive — the purchase price
  category?: string; // optional — used to detect education
};

export type Safety =
  | "trivial"
  | "cash"
  | "safe-emi"
  | "risky"
  | "dangerous"
  | "deferred";

export type PaymentMode = "cash" | "emi" | "deferred-loan";

export type FinanceVerdict = {
  surplus: number;
  estimatedEmi: number;
  emiImpactPercent: number; // 0–100+; Infinity if surplus <= 0
  safety: Safety;
  paymentMode: PaymentMode;
  isEducation: boolean;
  mathVerdict: string;
};

// Thresholds — tuned for INR amounts; can be revisited.
const TRIVIAL_ABSOLUTE_INR = 1000;
const TRIVIAL_PERCENT_OF_SURPLUS = 5; // < 5% of monthly surplus = trivial
const SAFE_EMI_IMPACT = 30; // EMI < 30% of surplus = safe
const RISKY_EMI_IMPACT = 50; // 30–50% = risky; > 50% = dangerous

// Rough EMI estimate: 5% effective annual rate flattened over 12 months.
// Not a real amortization — good enough for "is this remotely affordable?"
const EMI_MULTIPLIER = 1.05;
const EMI_MONTHS = 12;

export function computeFinanceVerdict(input: FinanceInput): FinanceVerdict {
  const { profile, amount, category } = input;

  // Surplus: students often run negative; treat that as zero (per §13 risks).
  // For everyone else, allow negative surplus to flow through — the math
  // verdict needs to surface it honestly.
  const rawSurplus = profile.monthly_income - profile.monthly_expenses;
  const surplus =
    profile.role === "student" ? Math.max(rawSurplus, 0) : rawSurplus;

  const estimatedEmi = (amount * EMI_MULTIPLIER) / EMI_MONTHS;
  const emiImpactPercent =
    surplus > 0 ? (estimatedEmi / surplus) * 100 : Number.POSITIVE_INFINITY;

  const isEducation = (category ?? "").toLowerCase() === "education";

  const trivialByAbsolute = amount < TRIVIAL_ABSOLUTE_INR;
  const trivialByPercent =
    surplus > 0 && (amount / surplus) * 100 < TRIVIAL_PERCENT_OF_SURPLUS;
  const isTrivial = trivialByAbsolute || trivialByPercent;

  let safety: Safety;
  let paymentMode: PaymentMode;

  if (isTrivial) {
    safety = "trivial";
    paymentMode = "cash";
  } else if (surplus <= 0) {
    safety = "deferred";
    paymentMode = "deferred-loan";
  } else if (amount <= surplus) {
    safety = "cash";
    paymentMode = "cash";
  } else if (emiImpactPercent < SAFE_EMI_IMPACT) {
    safety = "safe-emi";
    paymentMode = "emi";
  } else if (emiImpactPercent < RISKY_EMI_IMPACT) {
    safety = "risky";
    paymentMode = "emi";
  } else {
    safety = "dangerous";
    paymentMode = "emi";
  }

  // Education + student override: investment-in-self gets one tier of grace.
  // A student-coded "education" purchase rated dangerous gets nudged to risky
  // so the council can argue about it instead of vetoing outright.
  if (isEducation && profile.role === "student" && safety === "dangerous") {
    safety = "risky";
  }

  const mathVerdict = buildMathVerdict({
    amount,
    surplus,
    estimatedEmi,
    emiImpactPercent,
    safety,
    paymentMode,
    isEducation,
    role: profile.role,
  });

  return {
    surplus,
    estimatedEmi: round2(estimatedEmi),
    emiImpactPercent: Number.isFinite(emiImpactPercent)
      ? round2(emiImpactPercent)
      : emiImpactPercent,
    safety,
    paymentMode,
    isEducation,
    mathVerdict,
  };
}

function buildMathVerdict(args: {
  amount: number;
  surplus: number;
  estimatedEmi: number;
  emiImpactPercent: number;
  safety: Safety;
  paymentMode: PaymentMode;
  isEducation: boolean;
  role: Role;
}): string {
  const inr = (n: number) =>
    `₹${Math.round(n).toLocaleString("en-IN")}`;
  const pct = (n: number) =>
    Number.isFinite(n) ? `${Math.round(n)}%` : "infinite";

  const {
    amount,
    surplus,
    estimatedEmi,
    emiImpactPercent,
    safety,
    isEducation,
  } = args;

  switch (safety) {
    case "trivial":
      return `Trivial purchase: ${inr(amount)} is small relative to monthly surplus (${inr(surplus)}). Negligible risk.`;
    case "cash":
      return `Affordable in cash: ${inr(amount)} fits inside monthly surplus of ${inr(surplus)}, leaving ${inr(surplus - amount)} buffer.`;
    case "safe-emi":
      return `Safe via EMI: ~${inr(estimatedEmi)}/mo over 12 months consumes ${pct(emiImpactPercent)} of surplus (${inr(surplus)}). Within tolerance.`;
    case "risky":
      return `Risky: ~${inr(estimatedEmi)}/mo consumes ${pct(emiImpactPercent)} of surplus${isEducation ? " (softened from dangerous because this is education for a student)" : ""}. One bad month and they're underwater.`;
    case "dangerous":
      return `Dangerous: ~${inr(estimatedEmi)}/mo consumes ${pct(emiImpactPercent)} of surplus. Effectively unaffordable on current finances.`;
    case "deferred":
      return `Defer: monthly surplus is ${inr(surplus)} — there is nothing to service even a 12-month EMI. This purchase cannot be financed without changing the income/expense picture first.`;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
