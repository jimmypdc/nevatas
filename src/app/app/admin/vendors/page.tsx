// Vendor risk register index. One row per vendor with criticality + a
// traffic-light dot for review status (healthy / due-soon / overdue /
// never-reviewed). Each row links to the per-vendor detail page.

import Link from "next/link";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

import { VendorReviewIndicator } from "./vendor-review-indicator";

const DUE_SOON_DAYS = 14;

export default async function VendorsPage() {
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const vendors = await db.vendor.findMany({
    orderBy: [{ status: "asc" }, { criticality: "desc" }, { name: "asc" }],
    take: 500,
  });

  const now = new Date();
  const dueSoonAt = new Date(now.getTime() + DUE_SOON_DAYS * 86400_000);
  const counts = {
    total: vendors.filter((v) => v.status === "active").length,
    overdue: vendors.filter(
      (v) => v.status === "active" && v.nextReviewDueAt && v.nextReviewDueAt <= now,
    ).length,
    dueSoon: vendors.filter(
      (v) =>
        v.status === "active" &&
        v.nextReviewDueAt &&
        v.nextReviewDueAt > now &&
        v.nextReviewDueAt <= dueSoonAt,
    ).length,
    neverReviewed: vendors.filter(
      (v) => v.status === "active" && v.lastReviewedAt === null,
    ).length,
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Vendor risk register</h1>
          <p className="text-sm text-subtle">
            SOC 2 CC9.2 third-party / subprocessor inventory. Review cadence is
            driven by criticality (critical: 90d, high: 180d, medium: 365d, low: 730d).
            Review notes land in the audit log keyed by vendor id.
          </p>
        </div>
        <Link
          href="/app/admin/vendors/new"
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg"
        >
          + Add vendor
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Active vendors" value={counts.total.toString()} />
        <Tile label="Overdue review" value={counts.overdue.toString()} tone={counts.overdue > 0 ? "danger" : "ok"} />
        <Tile label={`Due in ${DUE_SOON_DAYS}d`} value={counts.dueSoon.toString()} tone={counts.dueSoon > 0 ? "warn" : "ok"} />
        <Tile label="Never reviewed" value={counts.neverReviewed.toString()} tone={counts.neverReviewed > 0 ? "warn" : "ok"} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Vendors ({vendors.length})
        </h2>
        {vendors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-subtle">
            No vendors recorded yet.{" "}
            <Link href="/app/admin/vendors/new" className="text-brand hover:underline">
              Add the first one →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium" />
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Criticality</th>
                  <th className="px-4 py-2 font-medium">Data categories</th>
                  <th className="px-4 py-2 font-medium">Last reviewed</th>
                  <th className="px-4 py-2 font-medium">Next due</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id} className="border-t border-border align-top">
                    <td className="px-4 py-2">
                      <VendorReviewIndicator
                        status={v.status}
                        lastReviewedAt={v.lastReviewedAt}
                        nextReviewDueAt={v.nextReviewDueAt}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{v.name}</div>
                      <div className="text-xs text-subtle truncate max-w-[40ch]">
                        {v.description}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{v.category}</td>
                    <td className="px-4 py-2">
                      <CriticalityPill criticality={v.criticality} />
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {dataCategoryList(v.dataCategoriesJson)}
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] text-subtle">
                      {v.lastReviewedAt
                        ? v.lastReviewedAt.toISOString().slice(0, 10)
                        : <em>never</em>}
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] text-subtle">
                      {v.nextReviewDueAt ? v.nextReviewDueAt.toISOString().slice(0, 10) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/app/admin/vendors/${v.id}`}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function dataCategoryList(json: unknown): React.ReactNode {
  if (!Array.isArray(json) || json.length === 0) {
    return <span className="text-subtle">—</span>;
  }
  return (
    <span className="font-mono">
      {(json as string[]).slice(0, 4).join(", ")}
      {json.length > 4 ? ` +${json.length - 4}` : ""}
    </span>
  );
}

function Tile({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const valueColor =
    tone === "danger" ? "text-danger" : tone === "warn" ? "text-warning" : "text-ink";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}

function CriticalityPill({ criticality }: { criticality: string }) {
  const tone =
    criticality === "critical"
      ? "border-danger/40 bg-danger/15 text-danger"
      : criticality === "high"
        ? "border-danger/30 bg-danger/10 text-danger"
        : criticality === "medium"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border bg-muted text-subtle";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {criticality}
    </span>
  );
}
