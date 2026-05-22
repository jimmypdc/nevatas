import Link from "next/link";

import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

import { NewPolicyForm } from "./new-policy-form";

export default async function NewSecurityPolicyPage() {
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/app/admin/security-policies" className="text-xs text-subtle hover:text-ink">
          ← Security policies
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">New policy</h1>
        <p className="text-sm text-subtle">
          Publishing this policy will require every active user to
          acknowledge it on their next sign-in (or now, if they&apos;re
          already signed in).
        </p>
      </header>
      <NewPolicyForm />
    </div>
  );
}
