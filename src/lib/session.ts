// Server-side helpers for resolving the current user + active organization.
// Every protected API/page route should call requireActor() at the top.

import { cookies } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { unauthenticated, forbidden } from "@/lib/errors";
import { loadActor, type ActorContext } from "@/lib/rbac/check";

const ORG_COOKIE = "nv_active_org";

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// Returns true when the current request is being served as part of an
// active admin impersonation. Lets server pages branch UI without going
// through the full requireActor() loader.
export async function isImpersonatingNow(): Promise<boolean> {
  const sessionUserId = await getCurrentUserId();
  if (!sessionUserId) return false;
  const { loadActiveImpersonation } = await import("@/lib/services/impersonation");
  const imp = await loadActiveImpersonation(sessionUserId);
  return imp !== null;
}

export async function getActiveOrganizationId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ORG_COOKIE)?.value ?? null;
}

export async function setActiveOrganizationId(organizationId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

// Resolve the actor or throw. Picks the first active membership if no active
// org is set in the cookie.
//
// During admin impersonation: the underlying NextAuth session belongs to
// the admin, but loadActiveImpersonation() returns the target's id; the
// returned ActorContext carries the target as userId and the admin as
// impersonatedBy. Sensitive permissions are stripped inside loadActor.
export async function requireActor(): Promise<ActorContext> {
  const sessionUserId = await getCurrentUserId();
  if (!sessionUserId) throw unauthenticated();

  // Lazy import avoids a cycle: impersonation service imports session for
  // setActiveOrganizationId.
  const { loadActiveImpersonation } = await import("@/lib/services/impersonation");
  const imp = await loadActiveImpersonation(sessionUserId);

  const effectiveUserId = imp ? imp.targetUserId : sessionUserId;

  let orgId = await getActiveOrganizationId();
  if (!orgId) {
    const first = await db.organizationUser.findFirst({
      where: { userId: effectiveUserId, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (!first) throw forbidden("No active organization membership");
    orgId = first.organizationId;
  }

  return loadActor({
    userId: effectiveUserId,
    organizationId: orgId,
    impersonatedBy: imp?.adminUserId,
  });
}
