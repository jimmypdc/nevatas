// Update a vendor's mutable fields.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import {
  VENDOR_CATEGORIES,
  VENDOR_CRITICALITIES,
  updateVendor,
} from "@/lib/services/vendor";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  description: z.string().min(1).optional(),
  category: z.enum(VENDOR_CATEGORIES).optional(),
  criticality: z.enum(VENDOR_CRITICALITIES).optional(),
  dataCategories: z.array(z.string()).optional(),
  dpaUrl: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const PATCH = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    await updateVendor({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      vendorId: params.id,
      description: body.description,
      category: body.category,
      criticality: body.criticality,
      dataCategories: body.dataCategories,
      dpaUrl: body.dpaUrl,
      websiteUrl: body.websiteUrl,
      contactEmail: body.contactEmail,
      notes: body.notes,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true });
  },
);
