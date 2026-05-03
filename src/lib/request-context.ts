import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

export type RequestContext = {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
};

export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined;
  return {
    requestId: h.get("x-request-id") ?? randomUUID(),
    ipAddress: ip,
    userAgent: h.get("user-agent") ?? undefined,
  };
}
