// Zod schema for the JSON stored in PlanRuleVersion.rulesJson. The API uses
// this to reject malformed rule-version payloads before they hit the database.
//
// The shape mirrors PlanRules in lib/validation/types.ts. Both should evolve
// together — if you add a field to PlanRules, mirror it here.

import { z } from "zod";

const MatchFormulaSchema = z
  .object({
    type: z.enum(["tiered", "flat"]),
    flatPercent: z.number().min(0).max(100).optional(),
    tiers: z
      .array(
        z.object({
          upToPercent: z.number().min(0).max(100),
          matchPercent: z.number().min(0).max(200),
        }),
      )
      .min(1)
      .max(10)
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "flat" && val.flatPercent === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "flat match formula requires flatPercent",
        path: ["flatPercent"],
      });
    }
    if (val.type === "tiered" && (!val.tiers || val.tiers.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tiered match formula requires at least one tier",
        path: ["tiers"],
      });
    }
    if (val.type === "tiered" && val.tiers) {
      for (let i = 1; i < val.tiers.length; i++) {
        if (val.tiers[i]!.upToPercent <= val.tiers[i - 1]!.upToPercent) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "tier upToPercent values must be strictly increasing",
            path: ["tiers", i, "upToPercent"],
          });
        }
      }
    }
  });

const TimelinessSchema = z
  .object({
    rule: z.enum([
      "small_plan_safe_harbor_7_business_days",
      "general_as_soon_as_feasible",
      "custom",
    ]),
    customWarningThresholdBusinessDays: z.number().int().min(0).max(60).optional(),
    customCriticalBusinessDays: z.number().int().min(0).max(60).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.rule === "custom") {
      if (val.customWarningThresholdBusinessDays === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "custom rule requires customWarningThresholdBusinessDays",
          path: ["customWarningThresholdBusinessDays"],
        });
      }
      if (val.customCriticalBusinessDays === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "custom rule requires customCriticalBusinessDays",
          path: ["customCriticalBusinessDays"],
        });
      }
      if (
        val.customWarningThresholdBusinessDays !== undefined &&
        val.customCriticalBusinessDays !== undefined &&
        val.customCriticalBusinessDays < val.customWarningThresholdBusinessDays
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "criticalBusinessDays must be >= warningBusinessDays",
          path: ["customCriticalBusinessDays"],
        });
      }
    }
  });

const EligibilitySchema = z.object({
  minServiceMonths: z.number().int().min(0).max(120).optional(),
});

const CompensationDefinitionSchema = z.object({
  basis: z.enum(["gross", "eligible_required"]),
  expectedEligibleToGrossMin: z.number().min(0).max(1).optional(),
});

export const PlanRulesSchema = z
  .object({
    planYear: z.number().int().min(2020).max(2100),
    irsElectiveDeferralLimit: z.number().min(0).max(1_000_000),
    irsCatchUpLimit50Plus: z.number().min(0).max(1_000_000),
    maxEmployeeDeferralPercent: z.number().min(0).max(100).optional(),
    matchFormula: MatchFormulaSchema.optional(),
    safeHarborType: z.enum(["basic_match", "enhanced_match", "nonelective_3pct", "none"]).optional(),
    timeliness: TimelinessSchema.optional(),
    participantCount: z.number().int().min(0).max(1_000_000).optional(),
    eligibility: EligibilitySchema.optional(),
    compensationDefinition: CompensationDefinitionSchema.optional(),
    // Free-form recordkeeper template key (validated against the in-memory
    // registry at generation time). 64-char cap keeps DB rows tidy.
    outputFormat: z.string().min(1).max(64).optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.timeliness?.rule === "small_plan_safe_harbor_7_business_days" &&
      typeof val.participantCount === "number" &&
      val.participantCount >= 100
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "small_plan_safe_harbor_7_business_days is only available to plans with fewer than 100 participants",
        path: ["timeliness", "rule"],
      });
    }
  });

export type PlanRulesInput = z.infer<typeof PlanRulesSchema>;
