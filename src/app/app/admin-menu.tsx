"use client";

// Header dropdown that groups the admin nav links. Only rendered when the
// actor has platform.impersonate (the parent layout decides). Closes on:
// outside click, Escape, link click, or focus leaving the menu.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ADMIN_LINKS: { href: string; label: string }[] = [
  { href: "/app/admin/impersonate", label: "Impersonate" },
  { href: "/app/admin/health", label: "Health" },
  { href: "/app/admin/evidence", label: "Evidence" },
  { href: "/app/admin/access-reviews", label: "Access reviews" },
  { href: "/app/admin/incidents", label: "Incidents" },
  { href: "/app/admin/vendors", label: "Vendors" },
  { href: "/app/admin/security-policies", label: "Security policies" },
];

export function AdminMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const onAdminPath = pathname?.startsWith("/app/admin/") ?? false;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          "inline-flex items-center gap-1 hover:text-ink " +
          (onAdminPath ? "text-ink" : "")
        }
      >
        Admin
        <span aria-hidden className="text-[10px] leading-none">▾</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 w-44 rounded-md border border-border bg-surface shadow-md z-10"
        >
          <ul className="py-1 text-sm">
            {ADMIN_LINKS.map((l) => {
              const active = pathname === l.href || pathname?.startsWith(l.href + "/");
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={
                      "block px-3 py-1.5 text-ink/80 hover:bg-muted hover:text-ink " +
                      (active ? "bg-muted text-ink" : "")
                    }
                    role="menuitem"
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
