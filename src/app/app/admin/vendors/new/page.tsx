import Link from "next/link";

import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

import { NewVendorForm } from "./new-vendor-form";

export default async function NewVendorPage() {
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/app/admin/vendors" className="text-xs text-subtle hover:text-ink">
          ← Vendor register
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Add vendor</h1>
        <p className="text-sm text-subtle">
          Capture who they are, what they do for us, what data they touch, and
          where the DPA / contract lives. Review cadence is set by criticality.
        </p>
      </header>
      <NewVendorForm />
    </div>
  );
}
