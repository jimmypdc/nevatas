import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";

import { UploadFlow } from "./upload-flow";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;

  const companies = await db.company.findMany({
    where: { organizationId: actor.organizationId },
    include: {
      plans: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Upload payroll file</h1>
        <p className="mt-1 text-sm text-subtle">
          CSV files are stored encrypted, hashed, and preserved as immutable source data.
          A payroll run is created and validated against plan rules.
        </p>
      </div>
      <UploadFlow
        initialCompanyId={sp.companyId ?? companies[0]?.id ?? ""}
        companies={companies.map((c) => ({
          id: c.id,
          name: c.name,
          plans: c.plans,
        }))}
      />
    </div>
  );
}
