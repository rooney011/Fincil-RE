import { describe, expect, it } from "vitest";
import { generateDemoData } from "./seed";

const FIXED_TODAY = new Date("2026-05-16T12:00:00Z");

describe("generateDemoData", () => {
  it("is deterministic for the same user id", () => {
    const a = generateDemoData({ userId: "user-a", monthlyIncome: 50_000, today: FIXED_TODAY });
    const b = generateDemoData({ userId: "user-a", monthlyIncome: 50_000, today: FIXED_TODAY });
    expect(a).toEqual(b);
  });

  it("produces different output for different user ids", () => {
    const a = generateDemoData({ userId: "user-a", monthlyIncome: 50_000, today: FIXED_TODAY });
    const b = generateDemoData({ userId: "user-b", monthlyIncome: 50_000, today: FIXED_TODAY });
    // The structure is the same (same templates), but per-row amounts/dates
    // differ because the seeded RNG diverges.
    expect(a.transactions).not.toEqual(b.transactions);
  });

  it("seeds at least one salary credit and >=50 outflows in a 60-day window", () => {
    const { transactions } = generateDemoData({
      userId: "consistent-user",
      monthlyIncome: 50_000,
      today: FIXED_TODAY,
    });

    const salary = transactions.filter((t) => t.category === "salary");
    const outflows = transactions.filter((t) => t.amount < 0);

    expect(salary.length).toBeGreaterThanOrEqual(1);
    expect(outflows.length).toBeGreaterThanOrEqual(50);
  });

  it("scales salary to the user's monthly income", () => {
    const lowIncome = generateDemoData({ userId: "u", monthlyIncome: 30_000, today: FIXED_TODAY });
    const highIncome = generateDemoData({ userId: "u", monthlyIncome: 120_000, today: FIXED_TODAY });

    const lowSalary = lowIncome.transactions.find((t) => t.category === "salary");
    const highSalary = highIncome.transactions.find((t) => t.category === "salary");

    expect(lowSalary?.amount).toBe(30_000);
    expect(highSalary?.amount).toBe(120_000);
  });

  it("clamps the scale factor when income is zero (e.g., student profile)", () => {
    const { transactions } = generateDemoData({
      userId: "student",
      monthlyIncome: 0,
      today: FIXED_TODAY,
    });
    // No salary credit (income is 0) but plausible expenses still seeded.
    // Generator falls back to ₹50k baseline so expense amounts are sane.
    const groceries = transactions.find((t) => t.description === "Groceries");
    expect(groceries).toBeDefined();
    if (groceries) expect(Math.abs(groceries.amount)).toBeGreaterThan(100);
  });

  it("returns exactly two goals", () => {
    const { goals } = generateDemoData({ userId: "u", monthlyIncome: 50_000, today: FIXED_TODAY });
    expect(goals).toHaveLength(2);
    expect(goals[0].name).toBe("Emergency fund");
    expect(goals[1].name).toBe("New laptop");
  });

  it("dates stay within the requested window", () => {
    const windowDays = 30;
    const { transactions } = generateDemoData({
      userId: "u",
      monthlyIncome: 50_000,
      today: FIXED_TODAY,
      windowDays,
    });
    const todayIso = "2026-05-16";
    const earliest = new Date(FIXED_TODAY);
    earliest.setDate(earliest.getDate() - windowDays);
    const earliestIso = earliest.toISOString().slice(0, 10);

    for (const t of transactions) {
      expect(t.occurred_at >= earliestIso).toBe(true);
      expect(t.occurred_at <= todayIso).toBe(true);
    }
  });
});
