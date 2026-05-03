import { describe, expect, it } from "vitest";

import { PlanRulesSchema } from "@/lib/validation/plan-rules-schema";

describe("PlanRulesSchema", () => {
  const baseRules = {
    planYear: 2026,
    irsElectiveDeferralLimit: 23_500,
    irsCatchUpLimit50Plus: 7_500,
    maxEmployeeDeferralPercent: 100,
  };

  it("accepts a minimal valid rules payload", () => {
    expect(PlanRulesSchema.safeParse(baseRules).success).toBe(true);
  });

  it("requires a tier list when matchFormula.type is tiered", () => {
    const r = PlanRulesSchema.safeParse({
      ...baseRules,
      matchFormula: { type: "tiered" },
    });
    expect(r.success).toBe(false);
  });

  it("requires flatPercent when matchFormula.type is flat", () => {
    const r = PlanRulesSchema.safeParse({
      ...baseRules,
      matchFormula: { type: "flat" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a tiered formula with non-monotonic upToPercent", () => {
    const r = PlanRulesSchema.safeParse({
      ...baseRules,
      matchFormula: {
        type: "tiered",
        tiers: [
          { upToPercent: 5, matchPercent: 100 },
          { upToPercent: 3, matchPercent: 50 }, // out of order
        ],
      },
    });
    expect(r.success).toBe(false);
  });

  it("requires both custom thresholds when timeliness rule is custom", () => {
    const r = PlanRulesSchema.safeParse({
      ...baseRules,
      timeliness: { rule: "custom", customWarningThresholdBusinessDays: 5 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects critical < warning for custom timeliness", () => {
    const r = PlanRulesSchema.safeParse({
      ...baseRules,
      timeliness: {
        rule: "custom",
        customWarningThresholdBusinessDays: 10,
        customCriticalBusinessDays: 5,
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects small-plan safe harbor for plans with >=100 participants", () => {
    const r = PlanRulesSchema.safeParse({
      ...baseRules,
      timeliness: { rule: "small_plan_safe_harbor_7_business_days" },
      participantCount: 250,
    });
    expect(r.success).toBe(false);
  });

  it("accepts small-plan safe harbor when participantCount is under 100", () => {
    const r = PlanRulesSchema.safeParse({
      ...baseRules,
      timeliness: { rule: "small_plan_safe_harbor_7_business_days" },
      participantCount: 25,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid tiered match", () => {
    const r = PlanRulesSchema.safeParse({
      ...baseRules,
      matchFormula: {
        type: "tiered",
        tiers: [
          { upToPercent: 3, matchPercent: 100 },
          { upToPercent: 5, matchPercent: 50 },
        ],
      },
    });
    expect(r.success).toBe(true);
  });
});
