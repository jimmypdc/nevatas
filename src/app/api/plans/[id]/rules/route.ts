import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { createPlanRuleVersion } from "@/lib/services/plan-rules";
import { PlanRulesSchema } from "@/lib/validation/plan-rules-schema";

const Params = z.object({ id: z.string().min(1) });

export const GET = apiHandler({ paramsSchema: Params }, async ({ params }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.planRead);

  const plan = await db.plan.findFirst({
    where: { id: params.id, company: { organizationId: actor.organizationId } },
    include: {
      company: { select: { id: true, name: true } },
      ruleVersions: { orderBy: { effectiveDate: "desc" } },
    },
  });
  if (!plan) throw notFound("Plan");

  return NextResponse.json({
    plan: {
      id: plan.id,
      name: plan.name,
      planNumber: plan.planNumber,
      recordkeeper: plan.recordkeeper,
      company: plan.company,
    },
    versions: plan.ruleVersions.map((v) => ({
      id: v.id,
      effectiveDate: v.effectiveDate,
      rulesJson: v.rulesJson,
      createdAt: v.createdAt,
      createdById: v.createdById,
    })),
  });
});

const PostBody = z.object({
  effectiveDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be a valid ISO date"),
  rules: PlanRulesSchema,
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: PostBody, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.planRuleVersionCreate);

    const plan = await db.plan.findFirst({
      where: { id: params.id, company: { organizationId: actor.organizationId } },
      select: { id: true, companyId: true },
    });
    if (!plan) throw notFound("Plan");

    const created = await createPlanRuleVersion({
      organizationId: actor.organizationId,
      companyId: plan.companyId,
      planId: plan.id,
      actorUserId: actor.userId,
      effectiveDate: new Date(body.effectiveDate),
      rules: body.rules,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(
      { id: created.id, effectiveDate: created.effectiveDate },
      { status: 201 },
    );
  },
);
