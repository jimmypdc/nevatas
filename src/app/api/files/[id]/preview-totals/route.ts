import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { previewTotals } from "@/lib/services/preview-totals";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({ mapping: z.record(z.string(), z.string()) });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body },
  async ({ params, body }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.payrollFileMap);

    const file = await db.payrollSourceFile.findUnique({
      where: { id: params.id },
      select: { companyId: true, company: { select: { organizationId: true } } },
    });
    if (!file || file.company.organizationId !== actor.organizationId) {
      throw notFound("Source file");
    }

    const result = await previewTotals({
      organizationId: actor.organizationId,
      companyId: file.companyId,
      sourceFileId: params.id,
      mapping: body.mapping,
    });
    return NextResponse.json(result);
  },
);
