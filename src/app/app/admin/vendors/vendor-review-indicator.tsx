// Traffic-light dot for a vendor row's review state. Pure presentation;
// the date math runs on the server in the page.

const DUE_SOON_DAYS = 14;

type Props = {
  status: string; // active | retired
  lastReviewedAt: Date | null;
  nextReviewDueAt: Date | null;
};

export function VendorReviewIndicator({ status, lastReviewedAt, nextReviewDueAt }: Props) {
  if (status === "retired") {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-muted"
        title="Retired"
      />
    );
  }
  if (!lastReviewedAt || !nextReviewDueAt) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-warning"
        title="Never reviewed"
      />
    );
  }
  const now = Date.now();
  const due = nextReviewDueAt.getTime();
  if (due <= now) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-danger"
        title="Review overdue"
      />
    );
  }
  if (due - now <= DUE_SOON_DAYS * 86400_000) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-warning"
        title={`Review due within ${DUE_SOON_DAYS} days`}
      />
    );
  }
  return (
    <span className="inline-block h-2.5 w-2.5 rounded-full bg-success" title="Healthy" />
  );
}
