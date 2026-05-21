// Create a new vendor in the risk register.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import {
  VENDOR_CATEGORIES,
  VENDOR_CRITICALITIES,
  createVendor,
} from "@/lib/services/vendor";

const Body = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1),
  category: z.enum(VENDOR_CATEGORIES),
  criticality: z.enum(VENDOR_CRITICALITIES),
  dataCategories: z.array(z.string()).default([]),
  dpaUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
  contactEmail: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = apiHandler(
  { bodySchema: Body, idempotent: true },
  async ({ body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    const r = await createVendor({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      name: body.name,
      description: body.description,
      category: body.category,
      criticality: body.criticality,
      dataCategories: body.dataCategories ?? [],
      dpaUrl: body.dpaUrl,
      websiteUrl: body.websiteUrl,
      contactEmail: body.contactEmail,
      notes: body.notes,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(r, { status: 201 });
  },
);
