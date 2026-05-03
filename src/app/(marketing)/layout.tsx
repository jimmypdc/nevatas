import Link from "next/link";
import type { ReactNode } from "react";

// Marketing-only chrome. The .mkt class scopes typography + paper background
// so the authenticated /app routes stay on the original clinical theme.

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mkt min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-ink/10 backdrop-blur supports-[backdrop-filter]:bg-paper/80 sticky top-0 z-40">
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-baseline gap-2 group"
          aria-label="Nevatas — home"
        >
          <span className="display text-[22px] font-medium tracking-tightest">
            Nevatas
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.2em] text-subtle pt-1">
            v1.0
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium">
          <a href="#how-it-works" className="text-ink/70 hover:text-ink transition-colors">
            How it works
          </a>
          <a href="#validation" className="text-ink/70 hover:text-ink transition-colors">
            Validation
          </a>
          <a href="#compliance" className="text-ink/70 hover:text-ink transition-colors">
            Security
          </a>
          <a href="#integrations" className="text-ink/70 hover:text-ink transition-colors">
            Integrations
          </a>
          <a href="#faq" className="text-ink/70 hover:text-ink transition-colors">
            FAQ
          </a>
          <a href="/help" className="text-ink/70 hover:text-ink transition-colors">
            Help
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-[13px] font-medium text-ink/70 hover:text-ink transition-colors"
          >
            Sign in
          </Link>
          <a
            href="mailto:demo@nevatas.local?subject=Nevatas%20demo%20request"
            className="text-[13px] font-medium px-3 py-1.5 rounded-sm bg-ink text-paper hover:bg-ink/85 transition-colors"
          >
            Book a demo →
          </a>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-ink/10 bg-paper">
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10 py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Logomark + tagline */}
          <div className="md:col-span-4">
            <div className="flex items-baseline gap-2">
              <span className="display text-[28px] font-medium tracking-tightest">
                Nevatas
              </span>
              <span className="mono text-[10px] uppercase tracking-[0.2em] text-subtle pt-1">
                v1.0
              </span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-subtle max-w-[28ch]">
              Compliance-grade infrastructure for retirement plan operations.
            </p>
            <p className="mt-6 mono text-[10px] uppercase tracking-[0.2em] text-subtle">
              Filed · MMXXVI
            </p>
          </div>

          <FooterCol
            title="Product"
            links={[
              { href: "#how-it-works", label: "How it works" },
              { href: "#validation", label: "Validation engine" },
              { href: "#integrations", label: "Integrations" },
              { href: "#built-for", label: "Built for" },
            ]}
          />
          <FooterCol
            title="Security"
            links={[
              { href: "#compliance", label: "ERISA-safe operations" },
              { href: "#compliance", label: "SOC 2 readiness" },
              { href: "#compliance", label: "Encryption" },
              { href: "mailto:security@nevatas.local", label: "security@nevatas.local" },
            ]}
          />
          <FooterCol
            title="Contact"
            links={[
              { href: "mailto:demo@nevatas.local", label: "Book a demo" },
              { href: "mailto:hello@nevatas.local", label: "hello@nevatas.local" },
              { href: "/help", label: "Help center" },
              { href: "/login", label: "Sign in" },
            ]}
          />
        </div>

        <hr className="rule-thin mt-12 mb-6" />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-[11px] text-subtle">
          <p className="mono uppercase tracking-[0.18em]">
            © Nevatas — operating system for retirement plan administration.
          </p>
          <p className="max-w-[60ch]">
            Nevatas is software infrastructure. It does not provide legal,
            tax, or fiduciary advice and is not a service provider under
            ERISA §3(16) or §3(38).
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="md:col-span-2 lg:col-span-2 xl:col-span-2 md:[&]:col-span-3">
      <p className="mono text-[10px] uppercase tracking-[0.2em] text-subtle">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              className="text-[13px] text-ink/80 hover:text-ink transition-colors"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
