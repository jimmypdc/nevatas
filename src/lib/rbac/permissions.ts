// Canonical list of platform permissions. The seed script writes these into the
// Permission table and assigns them to roles. Adding a new permission means:
//   1) Add the key here
//   2) Add it to the role mappings in roles.ts
//   3) Run prisma db seed
//
// Server-side permission checks should always use these constants — never raw
// strings — so the typechecker catches typos.

export const PERMISSIONS = {
  // Org & company
  organizationRead: "organization.read",
  companyRead: "company.read",
  companyUpdate: "company.update",

  // Plans
  planRead: "plan.read",
  planUpdate: "plan.update",
  planRuleVersionCreate: "plan_rule.version.create",

  // Payroll connections
  payrollConnectionCreate: "payroll_connection.create",
  payrollConnectionRead: "payroll_connection.read",
  payrollSyncRun: "payroll_sync.run",

  // File ingestion
  payrollFileUpload: "payroll_file.upload",
  payrollFileMap: "payroll_file.map",
  payrollFileParse: "payroll_file.parse",
  // Authorizes overriding a malware scan verdict (rare; documented).
  payrollFileScanOverride: "payroll_file.scan.override",

  // Validation & exceptions
  validationRun: "validation.run",
  exceptionResolve: "exception.resolve",
  exceptionWaive: "exception.waive",

  // Contributions & approval
  contributionGenerate: "contribution.generate",
  contributionApprove: "contribution.approve",
  contributionSubmit: "contribution.submit",

  // Audit & users
  auditRead: "audit.read",
  userInvite: "user.invite",
  roleManage: "role.manage",
  apiKeyCreate: "api_key.create",

  // Platform-only operations. Should only ever be granted to platform_super_admin.
  platformImpersonate: "platform.impersonate",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);
