import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
          <p className="text-sm text-subtle">
            Enter the email associated with your Nevatas account. If we recognize it, we&apos;ll
            send a reset link.
          </p>
        </div>
        <ForgotPasswordForm />
        <p className="text-xs text-subtle">
          <Link href="/login" className="hover:text-ink underline-offset-2 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
