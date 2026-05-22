// User-facing acknowledgment gate. The app layout redirects here when
// any active policy version remains unacknowledged. This page itself
// does NOT redirect (the user has to be able to read + acknowledge);
// after the last acknowledgment, the navigation buttons on the page lead
// back into the app.

import { redirect } from "next/navigation";

import { requireActor } from "@/lib/session";
import { getOutstandingPoliciesForUser } from "@/lib/services/security-policy";

import { AcknowledgeList } from "./acknowledge-actions";

export default async function AcknowledgePage() {
  const actor = await requireActor();
  const outstanding = await getOutstandingPoliciesForUser(actor.userId);
  if (outstanding.length === 0) {
    redirect("/app/dashboard");
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {outstanding.length === 1
            ? "1 policy needs your acknowledgment"
            : `${outstanding.length} policies need your acknowledgment`}
        </h1>
        <p className="text-sm text-subtle">
          Read each policy and click <strong>I acknowledge</strong>. Your
          acknowledgment timestamp + IP + browser are recorded as SOC 2
          CC2.3 evidence. You can&apos;t access the rest of the app until
          every active policy is acknowledged.
        </p>
      </header>

      <AcknowledgeList
        policies={outstanding.map((p) => ({
          versionId: p.versionId,
          policyName: p.policyName,
          policyDescription: p.policyDescription,
          version: p.version,
          publishedAt: p.publishedAt.toISOString(),
          changeSummary: p.changeSummary,
          content: p.content,
        }))}
      />
    </div>
  );
}
