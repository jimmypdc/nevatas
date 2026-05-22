import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signOut } from "@/lib/auth";
import { env } from "@/lib/env";
import { getCurrentUserId, requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { listMembershipsForUser } from "@/lib/services/organizations";
import { loadActiveImpersonation } from "@/lib/services/impersonation";
import { getOutstandingPoliciesForUser } from "@/lib/services/security-policy";

import { AdminMenu } from "./admin-menu";
import { IdleTimeoutWatcher } from "./idle-timeout-watcher";
import { ImpersonationBanner } from "./impersonation-banner";
import { OrgSwitcher } from "./org-switcher";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let actor;
  try {
    actor = await requireActor();
  } catch {
    redirect("/login");
  }

  // Gate: if the user has unacknowledged active policies, force them to
  // /app/acknowledge until the queue is empty. Self-exempts when we're
  // already rendering that page (otherwise infinite loop). The pathname
  // is forwarded by middleware as x-pathname since Next.js doesn't
  // expose the current URL inside a layout.
  const reqHeaders = await headers();
  const currentPath = reqHeaders.get("x-pathname") ?? "";
  if (!currentPath.startsWith("/app/acknowledge")) {
    const outstanding = await getOutstandingPoliciesForUser(actor.userId);
    if (outstanding.length > 0) {
      redirect("/app/acknowledge");
    }
  }

  const [user, memberships] = await Promise.all([
    db.user.findUnique({ where: { id: actor.userId }, select: { email: true, name: true } }),
    listMembershipsForUser(actor.userId),
  ]);

  const activeMembership =
    memberships.find((m) => m.organizationId === actor.organizationId) ?? memberships[0];

  // Load impersonation context for the banner. The session id we need to
  // pass to the banner exists only when the underlying NextAuth user is the
  // admin; we re-fetch via the session user id rather than going through
  // requireActor (which returns the target during impersonation).
  let impersonation: { targetEmail: string; expiresAt: Date } | null = null;
  if (actor.impersonatedBy) {
    const sessionUserId = await getCurrentUserId();
    if (sessionUserId) {
      const imp = await loadActiveImpersonation(sessionUserId);
      if (imp) impersonation = { targetEmail: user?.email ?? "", expiresAt: imp.expiresAt };
    }
  }

  const e = env();

  return (
    <div className="flex min-h-screen flex-col">
      <IdleTimeoutWatcher
        idleTimeoutMinutes={e.SESSION_IDLE_TIMEOUT_MINUTES}
        warningSeconds={e.SESSION_IDLE_WARNING_SECONDS}
      />
      {impersonation ? (
        <ImpersonationBanner
          targetEmail={impersonation.targetEmail}
          expiresAt={impersonation.expiresAt.toISOString()}
        />
      ) : null}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/app/dashboard" className="text-sm font-semibold tracking-tight">
              Nevatas
            </Link>
            <nav className="flex gap-4 text-sm text-subtle">
              <Link href="/app/dashboard" className="hover:text-ink">Dashboard</Link>
              <Link href="/app/upload" className="hover:text-ink">Upload</Link>
              <Link href="/app/users" className="hover:text-ink">Members</Link>
              <Link href="/app/account/security" className="hover:text-ink">Security</Link>
              {actor.permissions.has("platform.impersonate") ? <AdminMenu /> : null}
              <a
                href="/help"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ink"
              >
                Help ↗
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs text-subtle">
            <OrgSwitcher
              memberships={memberships}
              activeOrganizationId={actor.organizationId}
            />
            <span aria-hidden>•</span>
            <span>{user?.email}</span>
            <span aria-hidden>•</span>
            <span
              className="rounded-full bg-muted px-2 py-0.5 font-mono"
              title={activeMembership?.roleName}
            >
              {actor.roleKey}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="text-xs text-subtle hover:text-ink underline-offset-2 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
