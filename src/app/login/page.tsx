import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/app/dashboard");
  const sp = await searchParams;

  async function login(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").toLowerCase();
    const password = String(formData.get("password") ?? "");
    const totp = String(formData.get("totp") ?? "");
    // The Credentials provider authorize() callback handles all logging and
    // throttling via lib/auth/login-throttle. NextAuth re-throws on bad creds
    // and redirects on success; we let both flow up.
    await signIn("credentials", {
      email,
      password,
      totp,
      redirectTo: "/app/dashboard",
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Sign in to Nevatas</h1>
          <p className="text-sm text-subtle">Compliance-grade payroll-to-401(k) operations</p>
        </div>
        {sp.error ? (
          <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            Sign-in failed. Check your email and password.
          </p>
        ) : null}
        {sp.reason === "idle" ? (
          <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
            You were signed out due to inactivity. Sign in again to continue.
          </p>
        ) : null}
        <form action={login} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <a
                href="/forgot-password"
                className="text-xs text-subtle hover:text-ink underline-offset-2 hover:underline"
              >
                Forgot?
              </a>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="totp" className="text-sm font-medium">
              Authenticator code <span className="text-subtle">(if 2FA is enabled)</span>
            </label>
            <input
              id="totp"
              name="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code or recovery code"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm tracking-wide focus:border-brand focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
          >
            Sign in
          </button>
        </form>
        <p className="text-xs text-subtle">
          Need an account? Ask your firm administrator to invite you.
        </p>
      </div>
    </main>
  );
}
