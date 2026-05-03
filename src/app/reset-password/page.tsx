import Link from "next/link";

import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
          <p className="text-sm text-subtle">
            Choose a password at least 12 characters with a mix of cases, digits, and symbols.
          </p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            Reset link is missing the token. Request a new link from{" "}
            <Link href="/forgot-password" className="underline">
              the forgot-password page
            </Link>
            .
          </p>
        )}
        <p className="text-xs text-subtle">
          <Link href="/login" className="hover:text-ink underline-offset-2 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
