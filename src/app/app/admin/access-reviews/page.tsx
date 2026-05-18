// Access-review index. Lists every review across every organization and
// links to the per-review detail page. The "Start new review" form lets a
// platform admin snapshot an org's active memberships against a chosen
// period and begin reviewing.

import Link from "next/link";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

import { StartReviewForm } from "./start-review-form";

export default async function AccessReviewsPage() {
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const [reviews, organizations] = await Promise.all([
    db.accessReview.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        organization: { select: { name: true } },
        items: { select: { decision: true } },
      },
    }),
    db.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { users: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Access reviews</h1>
        <p className="text-sm text-subtle">
          SOC 2 CC6.3 logical-access reviews. Each review snapshots the
          active memberships in an organization at a point in time and
          captures a decision (confirm / revoke / note) per member.
          Completed reviews are immutable.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Start new review
        </h2>
        <StartReviewForm
          organizations={organizations.map((o) => ({
            id: o.id,
            name: o.name,
            activeMemberCount: o._count.users,
          }))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Reviews ({reviews.length})
        </h2>
        {reviews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-subtle">
            No reviews yet. Start the first one above.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Organization</th>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Items</th>
                  <th className="px-4 py-2 font-medium">Decisions (✓ / revoke / note / pending)</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => {
                  const counts = countDecisions(r.items);
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-4 py-2 font-mono text-xs">
                        {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-4 py-2">{r.organization.name}</td>
                      <td className="px-4 py-2 font-mono text-xs text-subtle">
                        {r.periodStart.toISOString().slice(0, 10)} → {r.periodEnd.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-2">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{r.items.length}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        <span className="text-success">{counts.confirmed}</span>
                        {" / "}
                        <span className="text-danger">{counts.revoke}</span>
                        {" / "}
                        <span className="text-warning">{counts.note}</span>
                        {" / "}
                        <span className="text-subtle">{counts.pending}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/app/admin/access-reviews/${r.id}`}
                          className="text-xs font-medium text-brand hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function countDecisions(items: { decision: string | null }[]) {
  return items.reduce(
    (acc, i) => {
      if (i.decision === "confirmed") acc.confirmed++;
      else if (i.decision === "revoke") acc.revoke++;
      else if (i.decision === "note") acc.note++;
      else acc.pending++;
      return acc;
    },
    { confirmed: 0, revoke: 0, note: 0, pending: 0 },
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "border-success/30 bg-success/10 text-success"
      : status === "cancelled"
        ? "border-border bg-muted text-subtle"
        : "border-warning/30 bg-warning/10 text-warning";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  );
}
