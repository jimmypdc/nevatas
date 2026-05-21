// Integration tests for the backup-verification service. Skipped by
// default; run with: RUN_DB_INTEGRATION_TESTS=1 npm test

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  recordBackupVerification,
  getLatestBackupStatuses,
  STALE_AFTER_HOURS,
} from "@/lib/services/backup-verification";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("backup-verification service", () => {
  const prisma = new PrismaClient();
  const cleanupIds: string[] = [];

  afterAll(async () => {
    for (const id of cleanupIds) {
      await prisma.backupVerification.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("records a success row with size + duration", async () => {
    const r = await recordBackupVerification({
      source: `it-test-${Date.now()}`,
      status: "success",
      sizeBytes: 1_073_741_824, // 1 GiB
      durationMs: 12_345,
    });
    cleanupIds.push(r.id);
    const row = await prisma.backupVerification.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.status).toBe("success");
    expect(row.sizeBytes).toBe(BigInt(1_073_741_824));
    expect(row.durationMs).toBe(12_345);
  });

  it("requires errorMessage when status is failure", async () => {
    await expect(
      recordBackupVerification({
        source: "it-fail-test",
        status: "failure",
      }),
    ).rejects.toThrow(/errorMessage/i);
  });

  it("refuses future-dated reports", async () => {
    await expect(
      recordBackupVerification({
        source: "it-future",
        status: "success",
        reportedAt: new Date(Date.now() + 3600_000), // 1h in the future
      }),
    ).rejects.toThrow(/future/i);
  });

  it("classifies sources as healthy / stale / failed in getLatestBackupStatuses", async () => {
    const fresh = await recordBackupVerification({
      source: `it-health-fresh-${Date.now()}`,
      status: "success",
    });
    cleanupIds.push(fresh.id);

    const stale = await recordBackupVerification({
      source: `it-health-stale-${Date.now()}`,
      status: "success",
      // 2h past the stale cutoff.
      reportedAt: new Date(Date.now() - (STALE_AFTER_HOURS + 2) * 3600_000),
    });
    cleanupIds.push(stale.id);

    const failed = await recordBackupVerification({
      source: `it-health-failed-${Date.now()}`,
      status: "failure",
      errorMessage: "disk full",
    });
    cleanupIds.push(failed.id);

    const all = await getLatestBackupStatuses();
    const map = new Map(all.map((s) => [s.source, s]));
    const freshSrc = fresh.source;
    const staleSrc = stale.source;
    const failedSrc = failed.source;
    expect(map.get(freshSrc)?.health).toBe("healthy");
    expect(map.get(staleSrc)?.health).toBe("stale");
    expect(map.get(failedSrc)?.health).toBe("failed");
  });

  it("returns latest row per source via DISTINCT ON", async () => {
    const source = `it-latest-test-${Date.now()}`;
    const a = await recordBackupVerification({
      source,
      status: "failure",
      errorMessage: "old failure",
      reportedAt: new Date(Date.now() - 3600_000), // 1h ago
    });
    cleanupIds.push(a.id);
    const b = await recordBackupVerification({ source, status: "success" });
    cleanupIds.push(b.id);

    const all = await getLatestBackupStatuses();
    const row = all.find((s) => s.source === source);
    expect(row?.latest?.id).toBe(b.id);
    expect(row?.health).toBe("healthy");
  });
});
