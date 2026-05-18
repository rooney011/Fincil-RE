import { describe, it, expect } from "vitest";
import {
  computeFinanceVerdict,
  type ProfileForEngine,
} from "./engine";

const employee: ProfileForEngine = {
  monthly_income: 50_000,
  monthly_expenses: 30_000,
  role: "employee",
  risk_tolerance: "medium",
};

describe("computeFinanceVerdict — surplus & EMI math", () => {
  it("computes surplus as income minus expenses", () => {
    const v = computeFinanceVerdict({ profile: employee, amount: 10_000 });
    expect(v.surplus).toBe(20_000);
  });

  it("estimates EMI as amount * 1.05 / 12", () => {
    const v = computeFinanceVerdict({ profile: employee, amount: 12_000 });
    expect(v.estimatedEmi).toBeCloseTo(1050, 2);
  });

  it("returns Infinity for emiImpactPercent when surplus is zero or negative", () => {
    const broke: ProfileForEngine = {
      ...employee,
      monthly_income: 20_000,
      monthly_expenses: 30_000,
    };
    const v = computeFinanceVerdict({ profile: broke, amount: 10_000 });
    expect(v.surplus).toBe(-10_000);
    expect(v.emiImpactPercent).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("computeFinanceVerdict — safety categories", () => {
  it("flags a small absolute amount as trivial", () => {
    const v = computeFinanceVerdict({ profile: employee, amount: 500 });
    expect(v.safety).toBe("trivial");
    expect(v.paymentMode).toBe("cash");
  });

  it("flags a small percent-of-surplus amount as trivial", () => {
    // 5000 vs 400k surplus = 1.25%, below the 5% trivial threshold.
    const rich: ProfileForEngine = {
      ...employee,
      monthly_income: 500_000,
      monthly_expenses: 100_000,
    };
    const v = computeFinanceVerdict({ profile: rich, amount: 5_000 });
    expect(v.safety).toBe("trivial");
  });

  it("flags purchases that fit inside surplus as cash", () => {
    // 15k purchase, 20k surplus, not trivial (>=1000 absolute, 75% of surplus)
    const v = computeFinanceVerdict({ profile: employee, amount: 15_000 });
    expect(v.safety).toBe("cash");
    expect(v.paymentMode).toBe("cash");
  });

  it("flags purchases needing low-impact EMI as safe-emi", () => {
    // 50k purchase. surplus=20k. EMI ~4375. Impact ~21.9% (< 30%).
    const v = computeFinanceVerdict({ profile: employee, amount: 50_000 });
    expect(v.safety).toBe("safe-emi");
    expect(v.paymentMode).toBe("emi");
    expect(v.emiImpactPercent).toBeGreaterThan(20);
    expect(v.emiImpactPercent).toBeLessThan(30);
  });

  it("flags purchases needing medium-impact EMI as risky", () => {
    // 100k purchase. EMI ~8750. Impact ~43.75% (30-50%).
    const v = computeFinanceVerdict({ profile: employee, amount: 100_000 });
    expect(v.safety).toBe("risky");
    expect(v.paymentMode).toBe("emi");
  });

  it("flags purchases needing high-impact EMI as dangerous", () => {
    // 250k purchase. EMI ~21875. Impact ~109%.
    const v = computeFinanceVerdict({ profile: employee, amount: 250_000 });
    expect(v.safety).toBe("dangerous");
    expect(v.paymentMode).toBe("emi");
  });
});

describe("computeFinanceVerdict — degenerate cases", () => {
  it("defers when income exactly matches expenses", () => {
    const breakeven: ProfileForEngine = {
      ...employee,
      monthly_income: 30_000,
      monthly_expenses: 30_000,
    };
    const v = computeFinanceVerdict({ profile: breakeven, amount: 10_000 });
    expect(v.surplus).toBe(0);
    expect(v.safety).toBe("deferred");
    expect(v.paymentMode).toBe("deferred-loan");
  });

  it("defers when expenses exceed income (non-student)", () => {
    const overdrawn: ProfileForEngine = {
      ...employee,
      monthly_income: 20_000,
      monthly_expenses: 30_000,
    };
    const v = computeFinanceVerdict({ profile: overdrawn, amount: 10_000 });
    expect(v.safety).toBe("deferred");
  });
});

describe("computeFinanceVerdict — student override", () => {
  it("caps a student's surplus at zero when they're running negative", () => {
    const student: ProfileForEngine = {
      monthly_income: 5_000,
      monthly_expenses: 10_000,
      role: "student",
      risk_tolerance: "low",
    };
    const v = computeFinanceVerdict({ profile: student, amount: 15_000 });
    expect(v.surplus).toBe(0);
    expect(v.safety).toBe("deferred");
  });

  it("softens an education purchase from dangerous to risky for a student", () => {
    const student: ProfileForEngine = {
      ...employee,
      role: "student",
    };
    // 250k normally dangerous (impact ~109%); education+student → risky.
    const v = computeFinanceVerdict({
      profile: student,
      amount: 250_000,
      category: "education",
    });
    expect(v.isEducation).toBe(true);
    expect(v.safety).toBe("risky");
  });

  it("does NOT soften education for non-students", () => {
    // Same numbers but role=employee → stays dangerous.
    const v = computeFinanceVerdict({
      profile: employee,
      amount: 250_000,
      category: "education",
    });
    expect(v.isEducation).toBe(true);
    expect(v.safety).toBe("dangerous");
  });
});

describe("computeFinanceVerdict — mathVerdict string", () => {
  it("produces a non-empty human-readable summary", () => {
    const v = computeFinanceVerdict({ profile: employee, amount: 50_000 });
    expect(v.mathVerdict.length).toBeGreaterThan(20);
    // Should mention either the EMI or surplus in any verdict that survives
    // past the deterministic checks.
    expect(v.mathVerdict).toMatch(/EMI|surplus|cash|trivial/i);
  });

  it("flags the education-softening in its verdict text", () => {
    const student: ProfileForEngine = { ...employee, role: "student" };
    const v = computeFinanceVerdict({
      profile: student,
      amount: 250_000,
      category: "education",
    });
    expect(v.mathVerdict.toLowerCase()).toContain("education");
  });
});
