import Link from "next/link";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

import { OpenIncidentForm } from "./open-incident-form";

export default async function NewIncidentPage() {
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const organizations = await db.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/app/admin/incidents" className="text-xs text-subtle hover:text-ink">
          ← All incidents
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Open new incident</h1>
        <p className="text-sm text-subtle">
          Capture what you know right now — additional context can be added as
          timeline notes after the incident is opened. Closure requires the
          root cause + containment + resolution narrative.
        </p>
      </header>
      <OpenIncidentForm organizations={organizations} />
    </div>
  );
}
