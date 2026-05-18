// Demo-mode data generator.
//
// Pure: given a user id + base income + reference date, returns the same rows
// every time. Keeps tests stable and lets the "Reset demo data" path produce
// the exact same world the user started with.

import type { Category } from "@/app/(app)/transactions/constants";

export type SeedTransaction = {
  description: string;
  amount: number; // negative = outflow, positive = inflow
  category: Category;
  occurred_at: string; // ISO date (YYYY-MM-DD)
};

export type SeedGoal = {
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null; // YYYY-MM-DD
  priority: "low" | "medium" | "high";
};

export type SeedBundle = {
  transactions: SeedTransaction[];
  goals: SeedGoal[];
};

// Tiny seeded RNG. djb2 hash → mulberry32. Same input → same sequence; that's
// the whole point.
function hashSeed(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function rng(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Recurring templates — fired once per calendar month in the window.
type Recurring = {
  description: string;
  category: Category;
  baseAmount: number; // positive magnitude; sign applied below
  direction: "in" | "out";
  dayOfMonth: number;
  jitter?: number; // ±this fraction of baseAmount
};

const RECURRING: Recurring[] = [
  { description: "Monthly salary", category: "salary", baseAmount: 1, direction: "in", dayOfMonth: 1 }, // scaled to income
  { description: "Electricity bill", category: "bills", baseAmount: 1600, direction: "out", dayOfMonth: 6, jitter: 0.3 },
  { description: "Internet (Airtel Xstream)", category: "bills", baseAmount: 999, direction: "out", dayOfMonth: 4 },
  { description: "Phone postpaid", category: "bills", baseAmount: 449, direction: "out", dayOfMonth: 9 },
  { description: "Water bill", category: "bills", baseAmount: 380, direction: "out", dayOfMonth: 11, jitter: 0.2 },
  { description: "Netflix", category: "subscription", baseAmount: 499, direction: "out", dayOfMonth: 14 },
  { description: "Spotify Premium", category: "subscription", baseAmount: 119, direction: "out", dayOfMonth: 14 },
  { description: "iCloud storage", category: "subscription", baseAmount: 75, direction: "out", dayOfMonth: 22 },
];

// Frequent templates — sampled across the window.
type Frequent = {
  description: string;
  category: Category;
  baseAmount: number;
  jitter: number;
  perMonth: number; // approx count per 30 days
};

const FREQUENT: Frequent[] = [
  { description: "Lunch at office canteen", category: "food", baseAmount: 140, jitter: 0.3, perMonth: 18 },
  { description: "Coffee", category: "food", baseAmount: 110, jitter: 0.4, perMonth: 12 },
  { description: "Biryani delivery", category: "food", baseAmount: 360, jitter: 0.25, perMonth: 5 },
  { description: "Dinner out", category: "food", baseAmount: 520, jitter: 0.5, perMonth: 4 },
  { description: "Groceries", category: "food", baseAmount: 1200, jitter: 0.35, perMonth: 4 },
  { description: "Uber ride", category: "transport", baseAmount: 180, jitter: 0.5, perMonth: 10 },
  { description: "Metro recharge", category: "transport", baseAmount: 500, jitter: 0.1, perMonth: 2 },
  { description: "Petrol", category: "transport", baseAmount: 1100, jitter: 0.3, perMonth: 2 },
  { description: "Amazon order", category: "shopping", baseAmount: 850, jitter: 0.8, perMonth: 3 },
  { description: "Clothing", category: "shopping", baseAmount: 1600, jitter: 0.6, perMonth: 1 },
  { description: "Movie tickets", category: "entertainment", baseAmount: 380, jitter: 0.3, perMonth: 2 },
  { description: "Drinks with friends", category: "entertainment", baseAmount: 750, jitter: 0.6, perMonth: 2 },
  { description: "Pharmacy", category: "health", baseAmount: 290, jitter: 0.6, perMonth: 1 },
];

export type SeedInput = {
  userId: string;
  monthlyIncome: number; // from profile; ≥0
  today: Date;
  windowDays?: number;
};

export function generateDemoData(input: SeedInput): SeedBundle {
  const windowDays = input.windowDays ?? 60;
  const rng = mulberry32(hashSeed(input.userId));

  // Scale: if user said ₹0 income (totally fine for student), still seed
  // plausible amounts. Otherwise scale around a ₹50k baseline so a ₹100k earner
  // sees larger numbers.
  const income = input.monthlyIncome > 0 ? input.monthlyIncome : 50_000;
  const scaleRaw = income / 50_000;
  const scale = Math.max(0.5, Math.min(scaleRaw, 4));

  const today = new Date(
    input.today.getFullYear(),
    input.today.getMonth(),
    input.today.getDate(),
  );
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const transactions: SeedTransaction[] = [];

  // Recurring rows — fire on dayOfMonth within the window.
  for (let d = new Date(windowStart); d <= today; d.setDate(d.getDate() + 1)) {
    for (const r of RECURRING) {
      if (d.getDate() !== r.dayOfMonth) continue;
      const base = r.description === "Monthly salary" ? income : r.baseAmount * scale;
      const jitterMul = r.jitter ? 1 + (rng() - 0.5) * 2 * r.jitter : 1;
      const magnitude = Math.round(base * jitterMul);
      transactions.push({
        description: r.description,
        amount: r.direction === "in" ? magnitude : -magnitude,
        category: r.category,
        occurred_at: isoDate(d),
      });
    }
  }

  // Frequent rows — distribute count uniformly across the window with jitter.
  for (const f of FREQUENT) {
    const totalCount = Math.round((f.perMonth * windowDays) / 30);
    for (let i = 0; i < totalCount; i += 1) {
      const dayOffset = Math.floor(rng() * windowDays);
      const occurred = new Date(windowStart);
      occurred.setDate(occurred.getDate() + dayOffset);
      const jitterMul = 1 + (rng() - 0.5) * 2 * f.jitter;
      const magnitude = Math.max(10, Math.round(f.baseAmount * scale * jitterMul));
      transactions.push({
        description: f.description,
        amount: -magnitude,
        category: f.category,
        occurred_at: isoDate(occurred),
      });
    }
  }

  transactions.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  const goalTargetDate = new Date(today);
  goalTargetDate.setMonth(goalTargetDate.getMonth() + 6);

  const goals: SeedGoal[] = [
    {
      name: "Emergency fund",
      target_amount: Math.round(50_000 * scale),
      current_amount: Math.round(12_000 * scale),
      target_date: null,
      priority: "high",
    },
    {
      name: "New laptop",
      target_amount: Math.round(80_000 * scale),
      current_amount: Math.round(25_000 * scale),
      target_date: isoDate(goalTargetDate),
      priority: "medium",
    },
  ];

  return { transactions, goals };
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
