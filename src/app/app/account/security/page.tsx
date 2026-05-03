import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";

import { MfaPanel } from "./mfa-panel";

export default async function SecurityPage() {
  const actor = await requireActor();
  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: { email: true, mfaEnabled: true, mfaEnrolledAt: true },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account security</h1>
        <p className="mt-1 text-sm text-subtle">{user?.email}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Two-factor authentication
        </h2>
        <p className="text-sm text-subtle">
          MFA is required to approve contribution files, manage roles, or create API keys.
          Use any RFC 6238 authenticator app (1Password, Authy, Google Authenticator, Apple Passwords).
        </p>
        <div className="rounded-xl border border-border bg-surface p-4">
          <MfaPanel
            enabled={user?.mfaEnabled ?? false}
            enrolledAt={user?.mfaEnrolledAt?.toISOString() ?? null}
          />
        </div>
      </section>
    </div>
  );
}
