// Service: create a new PlanRuleVersion. Per CLAUDE.md §8.1 ("Plan rules must
// be effective-date versioned. Do not mutate prior plan rules after payroll
// cycles have been processed. Create a new rule version instead.") and §24
// ("Allow unversioned plan rule changes" — DO NOT do).
//
// Constraints enforced here:
//   - Effective date may not be in the past relative to today (UTC). Backdating
//     would silently change validation results on prior payroll runs; use the
//     correction-cycle workflow (#9) for retroactive fixes.
//   - The (planId, effectiveDate) pair is unique (DB constraint).
//   - Each create writes an audit event with a hash of the rules JSON.

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { hashSnapshot } from "@/lib/crypto/hashing";
import { notFound, validationError } from "@/lib/errors";
import { PlanRulesSchema, type PlanRulesInput } from "@/lib/validation/plan-rules-schema";

export type CreatePlanRuleVersionInput = {
  organizationId: string;
  companyId: string;
  planId: string;
  actorUserId: string;
  effectiveDate: Date; // interpreted as UTC midnight
  rules: PlanRulesInput;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function createPlanRuleVersion(input: CreatePlanRuleVersionInput) {
  const parsed = PlanRulesSchema.safeParse(input.rules);
  if (!parsed.success) {
    throw validationError("Plan rules failed schema validation", parsed.error.flatten());
  }

  // Tenant scoping check.
  const plan = await db.plan.findFirst({
    where: { id: input.planId, companyId: input.companyId, company: { organizationId: input.organizationId } },
    select: { id: true },
  });
  if (!plan) throw notFound("Plan");

  const effective = utcMidnight(input.effectiveDate);
  const today = utcMidnight(new Date());
  if (effective.getTime() < today.getTime()) {
    throw validationError(
      "Effective date may not be in the past. Use the correction workflow to amend prior payroll runs.",
    );
  }

  const existing = await db.planRuleVersion.findUnique({
    where: { planId_effectiveDate: { planId: input.planId, effectiveDate: effective } },
    select: { id: true },
  });
  if (existing) {
    throw validationError("A rule version with that effective date already exists for this plan");
  }

  const created = await db.$transaction(async (tx) => {
    const v = await tx.planRuleVersion.create({
      data: {
        planId: input.planId,
        effectiveDate: effective,
        rulesJson: parsed.data as Prisma.InputJsonValue,
        createdById: input.actorUserId,
      },
    });

    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: input.companyId,
        planId: input.planId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.planRuleVersionCreated,
        entityType: "plan_rule_version",
        entityId: v.id,
        after: {
          effectiveDate: effective.toISOString(),
          rulesHash: hashSnapshot(parsed.data),
        },
        metadata: { effectiveDate: effective.toISOString() },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return v;
  });

  return created;
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
