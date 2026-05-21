// Per-vendor detail with header info, review-status panel, edit + review
// + retire actions, and a review-history excerpt sourced from the audit
// log (since the audit log is where we persist review notes).

import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

import { VendorActions } from "./vendor-actions";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const vendor = await db.vendor.findUnique({ where: { id } });
  if (!vendor) notFound();

  // Review history = audit events keyed to this vendor with the
  // vendor.reviewed action. The reviewNote lives in metadataJson.
  const reviewEvents = await db.auditEvent.findMany({
    where: { entityType: "vendor", entityId: vendor.id, action: "vendor.reviewed" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, createdAt: true, actorUserId: true, metadataJson: true },
  });

  const dataCategories = Array.isArray(vendor.dataCategoriesJson)
    ? (vendor.dataCategoriesJson as string[])
    : [];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href="/app/admin/vendors" className="text-xs text-subtle hover:text-ink">
          ← Vendor register
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{vendor.name}</h1>
        <p className="text-sm text-subtle font-mono">
          {vendor.category} · <CriticalityPill criticality={vendor.criticality} /> ·{" "}
          status <strong className="text-ink">{vendor.status}</strong>
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">Description</h2>
        <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm text-ink/85">
          {vendor.description}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card label="Data categories">
          {dataCategories.length === 0 ? (
            <span className="text-subtle text-xs">—</span>
          ) : (
            <ul className="space-y-1">
              {dataCategories.map((d) => (
                <li key={d} className="font-mono text-xs">
                  {d}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card label="Links">
          {vendor.websiteUrl ? (
            <div className="text-xs">
              <span className="text-subtle">Website</span>{" "}
              <a href={vendor.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline break-all">
                {vendor.websiteUrl}
              </a>
            </div>
          ) : null}
          {vendor.dpaUrl ? (
            <div className="mt-1 text-xs">
              <span className="text-subtle">DPA</span>{" "}
              <a href={vendor.dpaUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline break-all">
                {vendor.dpaUrl}
              </a>
            </div>
          ) : null}
          {vendor.contactEmail ? (
            <div className="mt-1 text-xs">
              <span className="text-subtle">Contact</span>{" "}
              <a href={`mailto:${vendor.contactEmail}`} className="text-brand hover:underline">
                {vendor.contactEmail}
              </a>
            </div>
          ) : null}
          {!vendor.websiteUrl && !vendor.dpaUrl && !vendor.contactEmail ? (
            <span className="text-subtle text-xs">—</span>
          ) : null}
        </Card>
        <Card label="Review status">
          <div className="text-xs space-y-1">
            <div>
              <span className="text-subtle">Last reviewed</span>{" "}
              {vendor.lastReviewedAt ? (
                <span className="font-mono">{vendor.lastReviewedAt.toISOString().slice(0, 10)}</span>
              ) : (
                <em>never</em>
              )}
            </div>
            <div>
              <span className="text-subtle">Next due</span>{" "}
              {vendor.nextReviewDueAt ? (
                <span className="font-mono">{vendor.nextReviewDueAt.toISOString().slice(0, 10)}</span>
              ) : (
                "—"
              )}
            </div>
          </div>
        </Card>
      </section>

      {vendor.notes ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">Notes</h2>
          <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm text-ink/85">
            {vendor.notes}
          </p>
        </section>
      ) : null}

      {vendor.status === "retired" ? (
        <section className="rounded-xl border border-border bg-muted p-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-subtle mb-1">Retired</div>
          <div className="font-mono text-xs text-subtle">
            {vendor.retiredAt?.toISOString().slice(0, 10)}
          </div>
          {vendor.retirementReason ? (
            <p className="mt-2 italic text-ink/85">&ldquo;{vendor.retirementReason}&rdquo;</p>
          ) : null}
        </section>
      ) : (
        <VendorActions
          vendorId={vendor.id}
          criticality={vendor.criticality as "low" | "medium" | "high" | "critical"}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Review history ({reviewEvents.length})
        </h2>
        {reviewEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-subtle">
            No reviews recorded yet.
          </div>
        ) : (
          <ol className="space-y-2">
            {reviewEvents.map((e) => {
              const meta = (e.metadataJson ?? {}) as { reviewNote?: string };
              return (
                <li key={e.id} className="rounded-md border border-border bg-surface p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-wide font-mono text-subtle">
                      reviewed
                    </span>
                    <span className="text-[11px] font-mono text-subtle">
                      {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                      {e.actorUserId ? <> · {e.actorUserId.slice(0, 10)}…</> : null}
                    </span>
                  </div>
                  {meta.reviewNote ? (
                    <p className="mt-1 whitespace-pre-wrap text-ink/85">{meta.reviewNote}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-subtle mb-2">{label}</div>
      {children}
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
