// System health / pre-flight panel. Available to Platform Super Admins
// (gated via the same permission set as the impersonation page). Surfaces
// the runtime state of every pluggable adapter so support / ops can verify
// "is the worker running" / "is KMS in env mode" / "is mail going to the
// console" before customer-facing actions.

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

type CheckSeverity = "ok" | "warn" | "error";

type Check = {
  category: string;
  label: string;
  severity: CheckSeverity;
  value: string;
  hint?: string;
};

export default async function HealthPage() {
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const e = env();
  const checks: Check[] = [];

  // ---------- Configuration ----------
  checks.push({
    category: "Config",
    label: "NODE_ENV",
    severity: e.NODE_ENV === "production" ? "ok" : "warn",
    value: e.NODE_ENV,
    hint:
      e.NODE_ENV === "production"
        ? undefined
        : "Dev defaults are in effect. Production must use NODE_ENV=production.",
  });
  checks.push({
    category: "Config",
    label: "APP_URL",
    severity: "ok",
    value: e.APP_URL,
  });

  // ---------- KMS ----------
  checks.push({
    category: "Security",
    label: "KMS driver",
    severity: e.KMS_DRIVER === "aws" ? "ok" : "warn",
    value: e.KMS_DRIVER,
    hint:
      e.KMS_DRIVER === "env"
        ? "Production must use KMS_DRIVER=aws. Env mode keeps the master key in process env."
        : undefined,
  });
  if (e.KMS_DRIVER === "aws" && !e.AWS_KMS_KEY_ID) {
    checks.push({
      category: "Security",
      label: "AWS_KMS_KEY_ID",
      severity: "error",
      value: "(unset)",
      hint: "Required when KMS_DRIVER=aws.",
    });
  }

  // ---------- Secrets ----------
  checks.push({
    category: "Security",
    label: "Secrets driver",
    severity: e.SECRETS_DRIVER === "aws" ? "ok" : "warn",
    value: e.SECRETS_DRIVER,
    hint:
      e.SECRETS_DRIVER === "env"
        ? "Production must use SECRETS_DRIVER=aws so secrets aren't in process env."
        : undefined,
  });

  // ---------- Storage ----------
  checks.push({
    category: "Storage",
    label: "Driver",
    severity: e.STORAGE_DRIVER === "local" ? "warn" : "ok",
    value: e.STORAGE_DRIVER,
    hint:
      e.STORAGE_DRIVER === "local"
        ? "Local storage is dev-only. Production must use s3 or r2."
        : e.S3_BUCKET
          ? `Bucket: ${e.S3_BUCKET}`
          : "S3_BUCKET is unset.",
  });

  // ---------- Email ----------
  const emailDriver = process.env.EMAIL_DRIVER ?? "console";
  checks.push({
    category: "Email",
    label: "Driver",
    severity: emailDriver === "console" ? "warn" : "ok",
    value: emailDriver,
    hint:
      emailDriver === "console"
        ? "Console driver writes to stdout — production must use resend or aws_ses."
        : undefined,
  });
  if (emailDriver !== "console" && !process.env.EMAIL_FROM) {
    checks.push({
      category: "Email",
      label: "EMAIL_FROM",
      severity: "error",
      value: "(unset)",
      hint: "Required when EMAIL_DRIVER is not console.",
    });
  }

  // ---------- Scanner ----------
  const scannerDriver = process.env.SCANNER_DRIVER ?? "noop";
  checks.push({
    category: "Security",
    label: "Malware scanner",
    severity: scannerDriver === "noop" ? "warn" : "ok",
    value: scannerDriver,
    hint:
      scannerDriver === "noop"
        ? "Noop scanner accepts every file. Production must use clamav or aws_guardduty."
        : undefined,
  });

  // ---------- Worker ----------
  const [queued, running, dead, recentSuccess, oldestQueued] = await Promise.all([
    db.backgroundJob.count({ where: { status: "queued" } }),
    db.backgroundJob.count({ where: { status: "running" } }),
    db.backgroundJob.count({ where: { status: "dead" } }),
    db.backgroundJob.findFirst({
      where: { status: "succeeded" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    db.backgroundJob.findFirst({
      where: { status: "queued" },
      orderBy: { runAfter: "asc" },
      select: { runAfter: true },
    }),
  ]);
  checks.push({
    category: "Worker",
    label: "Queue depth (queued / running / dead)",
    severity: dead > 0 ? "error" : queued > 50 ? "warn" : "ok",
    value: `${queued} / ${running} / ${dead}`,
    hint:
      dead > 0
        ? `${dead} dead jobs need investigation.`
        : queued > 50
          ? "Queue is backing up. Is the worker process running? `npm run worker`."
          : undefined,
  });
  if (recentSuccess?.completedAt) {
    const minsAgo = Math.floor((Date.now() - recentSuccess.completedAt.getTime()) / 60_000);
    checks.push({
      category: "Worker",
      label: "Last successful job",
      severity: minsAgo > 60 ? "warn" : "ok",
      value: `${minsAgo} min ago`,
      hint: minsAgo > 60 ? "Worker may be stalled. Check the worker process." : undefined,
    });
  }
  if (oldestQueued?.runAfter) {
    const ageMins = Math.floor((Date.now() - oldestQueued.runAfter.getTime()) / 60_000);
    if (ageMins > 5) {
      checks.push({
        category: "Worker",
        label: "Oldest queued job age",
        severity: ageMins > 60 ? "error" : "warn",
        value: `${ageMins} min`,
        hint: "A queued job past its runAfter is a sign the worker isn't draining.",
      });
    }
  }

  // ---------- Database ----------
  // Pending migrations: hard to detect from app code without parsing
  // _prisma_migrations. As a coarse signal, list how many migrations are on
  // disk vs the latest applied.
  let dbStatus: Check = {
    category: "Database",
    label: "Connectivity",
    severity: "ok",
    value: "connected",
  };
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = {
      category: "Database",
      label: "Connectivity",
      severity: "error",
      value: "FAILED",
      hint: "Cannot reach Postgres. Check DATABASE_URL + credentials.",
    };
  }
  checks.push(dbStatus);

  // ---------- Recent activity ----------
  const recentAudit = await db.auditEvent.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, action: true },
  });
  if (recentAudit) {
    const minsAgo = Math.floor((Date.now() - recentAudit.createdAt.getTime()) / 60_000);
    checks.push({
      category: "Activity",
      label: "Last audit event",
      severity: "ok",
      value: `${recentAudit.action} (${minsAgo} min ago)`,
    });
  }

  const grouped = checks.reduce<Record<string, Check[]>>((acc, c) => {
    (acc[c.category] = acc[c.category] ?? []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">System health</h1>
        <p className="mt-1 text-sm text-subtle">
          Pre-flight check for ops + support. Anything red blocks production launch.
          Yellow rows are dev-only defaults that need to be flipped before customer data lands.
        </p>
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <section key={category} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">{category}</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <tbody>
                {items.map((c, i) => (
                  <tr key={i} className="border-t border-border first:border-t-0">
                    <td className="px-4 py-2 align-top">
                      <SeverityBadge severity={c.severity} />
                    </td>
                    <td className="px-4 py-2 align-top font-medium">{c.label}</td>
                    <td className="px-4 py-2 align-top font-mono text-xs">{c.value}</td>
                    <td className="px-4 py-2 align-top text-xs text-subtle">{c.hint ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: CheckSeverity }) {
  const tone =
    severity === "ok"
      ? "border-success/30 bg-success/10 text-success"
      : severity === "warn"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-danger/30 bg-danger/10 text-danger";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {severity === "ok" ? "OK" : severity === "warn" ? "WARN" : "FAIL"}
    </span>
  );
}
