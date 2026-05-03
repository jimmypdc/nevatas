import Link from "next/link";
import type { ReactNode } from "react";

import { auth } from "@/lib/auth";

// Public help surface. Available to both marketing visitors and authenticated
// app users. Inherits the marketing-style typography via the .mkt class so
// it visually pairs with /, while keeping its own minimal chrome — not
// wrapped in either the (marketing) or /app layout.

export default async function HelpLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const isAuthed = Boolean(session?.user);
  return (
    <div className="mkt min-h-screen flex flex-col">
      <header className="border-b border-ink/10 sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
        <div className="mx-auto max-w-[1320px] px-6 lg:px-10 h-14 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Link
              href="/"
              className="display text-[20px] font-medium tracking-tightest"
            >
              Nevatas
            </Link>
            <span className="mono text-[10px] uppercase tracking-[0.22em] text-subtle">
              / Help
            </span>
          </div>
          <div className="flex items-center gap-4 text-[13px]">
            <a
              href="mailto:hello@nevatas.local?subject=Nevatas%20question"
              className="text-ink/70 hover:text-ink transition-colors"
            >
              Contact
            </a>
            <Link
              href={isAuthed ? "/app/dashboard" : "/"}
              className="font-medium px-3 py-1.5 rounded-sm bg-ink text-paper hover:bg-ink/85 transition-colors"
            >
              {isAuthed ? "Back to app →" : "Back to home →"}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-24 border-t border-ink/10 bg-paper">
        <div className="mx-auto max-w-[1320px] px-6 lg:px-10 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[12px] text-subtle">
          <p className="mono uppercase tracking-[0.18em]">© Nevatas — Help center</p>
          <div className="flex items-center gap-5">
            <Link href="/" className="hover:text-ink transition-colors">
              Marketing
            </Link>
            <Link href="/login" className="hover:text-ink transition-colors">
              Sign in
            </Link>
            <a
              href="mailto:security@nevatas.local"
              className="hover:text-ink transition-colors"
            >
              security@nevatas.local
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
