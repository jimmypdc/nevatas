import Link from "next/link";

import { AcceptInviteForm } from "./accept-invite-form";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Accept invitation</h1>
        </div>
        {token ? (
          <AcceptInviteForm token={token} />
        ) : (
          <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            Invitation link is missing the token.
          </p>
        )}
        <p className="text-xs text-subtle">
          <Link href="/login" className="hover:text-ink underline-offset-2 hover:underline">
            ← Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
