// Per-review detail page. Shows every snapshot item with its current
// decision (or pending) and lets the reviewer decide / complete / cancel.

import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

import { ReviewActions, ItemDecisionRow } from "./review-actions";

export default async function AccessReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const review = await db.accessReview.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true } },
      items: { orderBy: { userEmail: "asc" } },
    },
  });
  if (!review) notFound();

  const counts = review.items.reduce(
    (acc, i) => {
      if (i.decision === "confirmed") acc.confirmed++;
      else if (i.decision === "revoke") acc.revoke++;
      else if (i.decision === "note") acc.note++;
      else acc.pending++;
      return acc;
    },
    { confirmed: 0, revoke: 0, note: 0, pending: 0 },
  );

  const isDraft = review.status === "draft";
  const allDecided = counts.pending === 0;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href="/app/admin/access-reviews" className="text-xs text-subtle hover:text-ink">
          ← All reviews
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {review.organization.name} · Access review
        </h1>
        <p className="text-sm text-subtle font-mono">
          period {review.periodStart.toISOString().slice(0, 10)} → {review.periodEnd.toISOString().slice(0, 10)} ·{" "}
          status <strong className="text-ink">{review.status}</strong>
          {review.completedAt ? (
            <> · completed {review.completedAt.toISOString().slice(0, 16).replace("T", " ")}</>
          ) : null}
          {review.cancelledAt ? (
            <> · cancelled {review.cancelledAt.toISOString().slice(0, 16).replace("T", " ")}</>
          ) : null}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Total" value={review.items.length.toString()} />
        <Tile label="Confirmed" value={counts.confirmed.toString()} tone="ok" />
        <Tile label="Revoke" value={counts.revoke.toString()} tone={counts.revoke > 0 ? "warn" : "ok"} />
        <Tile label="Note" value={counts.note.toString()} tone={counts.note > 0 ? "warn" : "ok"} />
        <Tile label="Pending" value={counts.pending.toString()} tone={counts.pending > 0 ? "warn" : "ok"} />
      </section>

      {review.notes ? (
        <section className="rounded-xl border border-border bg-surface p-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-subtle mb-1">Reviewer note</div>
          <div className="text-ink italic">&ldquo;{review.notes}&rdquo;</div>
        </section>
      ) : null}

      {review.cancelReason ? (
        <section className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-subtle mb-1">Cancellation reason</div>
          <div className="text-ink italic">&ldquo;{review.cancelReason}&rdquo;</div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Memberships ({review.items.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">MFA</th>
                <th className="px-4 py-2 font-medium">Decision</th>
                <th className="px-4 py-2 font-medium">Note</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {review.items.map((it) => (
                <ItemDecisionRow
                  key={it.id}
                  reviewId={review.id}
                  item={{
                    id: it.id,
                    userEmail: it.userEmail,
                    roleKey: it.roleKey,
                    mfaEnabled: it.mfaEnabled,
                    decision: it.decision,
                    decisionNote: it.decisionNote,
                  }}
                  editable={isDraft}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isDraft ? (
        <ReviewActions reviewId={review.id} canComplete={allDecided} pendingCount={counts.pending} />
      ) : null}
    </div>
  );
}

function Tile({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const valueColor = tone === "warn" ? "text-warning" : "text-ink";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}
