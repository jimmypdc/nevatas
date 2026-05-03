// Seed script: roles, permissions, demo organization, demo users, two demo
// companies + plans, demo participants, a sample loan schedule. Idempotent —
// re-running is safe and keeps existing rows intact when possible.
//
// Run: npm run db:seed

import { Prisma, PrismaClient } from "@prisma/client";

import { hashPassword } from "@/lib/crypto/hashing";
import { validatePassword } from "@/lib/auth/password-policy";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac/permissions";
import { ROLE_DEFINITIONS, ROLES } from "@/lib/rbac/roles";

const db = new PrismaClient();

async function main() {
  console.log("Seeding permissions…");
  for (const key of ALL_PERMISSION_KEYS) {
    await db.permission.upsert({
      where: { key },
      create: { key },
      update: {},
    });
  }
  const allPerms = await db.permission.findMany();
  const permByKey = new Map(allPerms.map((p) => [p.key, p]));

  console.log("Seeding roles…");
  for (const [roleKey, def] of Object.entries(ROLE_DEFINITIONS)) {
    const role = await db.role.upsert({
      where: { key: roleKey },
      create: { key: roleKey, name: def.name, description: def.description },
      update: { name: def.name, description: def.description },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permKey of def.permissions) {
      const perm = permByKey.get(permKey);
      if (!perm) continue;
      await db.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  console.log("Seeding demo organization…");
  const org = await db.organization.upsert({
    where: { slug: "demo-tpa" },
    create: { name: "Demo TPA", slug: "demo-tpa" },
    update: {},
  });

  const firmAdminRole = await db.role.findUniqueOrThrow({ where: { key: ROLES.firmAdmin } });
  const sponsorApproverRole = await db.role.findUniqueOrThrow({
    where: { key: ROLES.planSponsorApprover },
  });
  const platformSuperAdminRole = await db.role.findUniqueOrThrow({
    where: { key: ROLES.platformSuperAdmin },
  });

  console.log("Seeding demo users…");
  const passwords = {
    admin: "nevatas-admin-2026!",
    approver: "nevatas-approver-2026!",
    platform: "nevatas-platform-2026!",
  };
  for (const pw of Object.values(passwords)) {
    const policy = await validatePassword(pw, { skipHibp: true });
    if (!policy.ok) {
      throw new Error(`Seed password failed policy: ${policy.reasons.join("; ")}`);
    }
  }
  const adminPass = await hashPassword(passwords.admin);
  const admin = await db.user.upsert({
    where: { email: "admin@demo.local" },
    create: {
      email: "admin@demo.local",
      name: "Demo Admin",
      passwordHash: adminPass,
      emailVerified: new Date(),
    },
    update: { passwordHash: adminPass },
  });

  const approverPass = await hashPassword(passwords.approver);
  const approver = await db.user.upsert({
    where: { email: "approver@demo.local" },
    create: {
      email: "approver@demo.local",
      name: "Demo Approver",
      passwordHash: approverPass,
      emailVerified: new Date(),
    },
    update: { passwordHash: approverPass },
  });

  const platformPass = await hashPassword(passwords.platform);
  const platform = await db.user.upsert({
    where: { email: "platform@demo.local" },
    create: {
      email: "platform@demo.local",
      name: "Platform Super Admin",
      passwordHash: platformPass,
      emailVerified: new Date(),
    },
    update: { passwordHash: platformPass },
  });

  await db.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: admin.id } },
    create: { organizationId: org.id, userId: admin.id, roleId: firmAdminRole.id },
    update: { roleId: firmAdminRole.id, status: "active" },
  });
  await db.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: approver.id } },
    create: { organizationId: org.id, userId: approver.id, roleId: sponsorApproverRole.id },
    update: { roleId: sponsorApproverRole.id, status: "active" },
  });
  await db.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: platform.id } },
    create: { organizationId: org.id, userId: platform.id, roleId: platformSuperAdminRole.id },
    update: { roleId: platformSuperAdminRole.id, status: "active" },
  });

  console.log("Seeding demo companies + plans…");
  const acme = await upsertCompanyAndPlan({
    orgId: org.id,
    companyName: "Acme Industries Inc.",
    planName: "Acme 401(k) Plan",
    planNumber: "001",
    recordkeeper: "Empower (illustrative)",
    rulesJson: {
      planYear: 2026,
      irsElectiveDeferralLimit: 23_500,
      irsCatchUpLimit50Plus: 7_500,
      maxEmployeeDeferralPercent: 100,
      matchFormula: {
        type: "tiered",
        tiers: [
          { upToPercent: 3, matchPercent: 100 },
          { upToPercent: 5, matchPercent: 50 },
        ],
      },
      safeHarborType: "basic_match",
      timeliness: { rule: "small_plan_safe_harbor_7_business_days" },
      participantCount: 25,
      eligibility: { minServiceMonths: 12 },
      compensationDefinition: { basis: "gross" },
      outputFormat: "empower.v1",
    },
  });

  await upsertCompanyAndPlan({
    orgId: org.id,
    companyName: "Beta Manufacturing LLC",
    planName: "Beta Manufacturing 401(k)",
    planNumber: "002",
    recordkeeper: "Fidelity (illustrative)",
    rulesJson: {
      planYear: 2026,
      irsElectiveDeferralLimit: 23_500,
      irsCatchUpLimit50Plus: 7_500,
      maxEmployeeDeferralPercent: 75,
      matchFormula: {
        type: "flat",
        flatPercent: 4,
      },
      safeHarborType: "nonelective_3pct",
      timeliness: { rule: "general_as_soon_as_feasible" },
      participantCount: 180,
      eligibility: { minServiceMonths: 6 },
      compensationDefinition: {
        basis: "eligible_required",
        expectedEligibleToGrossMin: 0.9,
      },
      outputFormat: "fidelity.v1",
    },
  });

  console.log("Seeding Acme participants…");
  const acmeParticipants = [
    { ext: "E001", first: "Alex", last: "Sample", hire: "2020-03-15", term: null, status: "active" },
    { ext: "E002", first: "Brooke", last: "Demo", hire: "2018-07-01", term: null, status: "active" },
    { ext: "E003", first: "Casey", last: "Doe", hire: "2024-01-10", term: null, status: "active" },
    { ext: "E004", first: "Drew", last: "Example", hire: "2022-11-20", term: null, status: "active" },
    { ext: "E005", first: "Erin", last: "Tester", hire: "2026-01-05", term: null, status: "active" },
    {
      ext: "E006",
      first: "Frankie",
      last: "Former",
      hire: "2019-04-01",
      term: "2026-03-31",
      status: "terminated",
    },
  ];
  for (const p of acmeParticipants) {
    await db.participant.upsert({
      where: { companyId_externalEmployeeId: { companyId: acme.companyId, externalEmployeeId: p.ext } },
      create: {
        companyId: acme.companyId,
        externalEmployeeId: p.ext,
        firstName: p.first,
        lastName: p.last,
        dateOfHire: new Date(p.hire),
        dateOfTermination: p.term ? new Date(p.term) : null,
        status: p.status,
      },
      update: {},
    });
  }

  console.log("Seeding sample loan schedule…");
  const e002 = await db.participant.findFirstOrThrow({
    where: { companyId: acme.companyId, externalEmployeeId: "E002" },
  });
  await db.loanSchedule.upsert({
    where: { participantId_loanNumber: { participantId: e002.id, loanNumber: "LN-2024-1" } },
    create: {
      participantId: e002.id,
      loanNumber: "LN-2024-1",
      originationDate: new Date("2024-09-01"),
      principalAmount: "8000.00",
      expectedPaymentAmount: "175.00",
      paymentFrequency: "biweekly",
      status: "active",
    },
    update: {},
  });

  console.log("\n────────────────────────────────────────────────────────");
  console.log("Seed complete.");
  console.log("\n  Sign in at http://localhost:3000/login as one of:");
  console.log(`    admin@demo.local       / ${passwords.admin}     (Firm Admin — uploads, validates, generates)`);
  console.log(`    approver@demo.local    / ${passwords.approver}  (Plan Sponsor Approver — approves contribution files)`);
  console.log(`    platform@demo.local    / ${passwords.platform}  (Platform Super Admin — impersonation)`);
  console.log("\n  Demo data:");
  console.log("    • Demo TPA org, 2 companies, 2 plans");
  console.log("    • 6 Acme participants (1 terminated, 1 hired post-payroll-date for eligibility demos)");
  console.log("    • 1 active loan schedule on E002 ($175/biweekly)");
  console.log("\n  Demo workflow:");
  console.log("    1. Upload examples/contributions-sample.csv at /app/upload (companyId=Acme)");
  console.log("    2. Confirm column mapping → confirm totals → create payroll run");
  console.log("    3. Review validation issues (E005 has $0 gross + deferral; E006 is terminated)");
  console.log("    4. Generate contribution file (Empower-style)");
  console.log("    5. Sign out, sign in as approver, approve");
  console.log("    6. Sign back in as admin, download audit-package ZIP");
  console.log("────────────────────────────────────────────────────────\n");
}

async function upsertCompanyAndPlan(params: {
  orgId: string;
  companyName: string;
  planName: string;
  planNumber: string;
  recordkeeper: string;
  rulesJson: Record<string, unknown>;
}): Promise<{ companyId: string; planId: string }> {
  let company = await db.company.findFirst({
    where: { organizationId: params.orgId, name: params.companyName },
  });
  if (!company) {
    company = await db.company.create({
      data: { organizationId: params.orgId, name: params.companyName },
    });
  }

  let plan = await db.plan.findFirst({
    where: { companyId: company.id, name: params.planName },
  });
  if (!plan) {
    plan = await db.plan.create({
      data: {
        companyId: company.id,
        name: params.planName,
        planNumber: params.planNumber,
        recordkeeper: params.recordkeeper,
      },
    });
  }

  // Use 2026-01-01 so the rules are effective for current-year payroll runs.
  await db.planRuleVersion.upsert({
    where: {
      planId_effectiveDate: {
        planId: plan.id,
        effectiveDate: new Date(Date.UTC(2026, 0, 1)),
      },
    },
    create: {
      planId: plan.id,
      effectiveDate: new Date(Date.UTC(2026, 0, 1)),
      rulesJson: params.rulesJson as Prisma.InputJsonValue,
    },
    update: { rulesJson: params.rulesJson as Prisma.InputJsonValue },
  });

  return { companyId: company.id, planId: plan.id };
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
