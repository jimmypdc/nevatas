import { PERMISSIONS, type PermissionKey } from "@/lib/rbac/permissions";

export const ROLES = {
  platformSuperAdmin: "platform_super_admin",
  platformSupportAdmin: "platform_support_admin",
  firmAdmin: "firm_admin",
  firmOperationsUser: "firm_operations_user",
  planSponsorAdmin: "plan_sponsor_admin",
  planSponsorApprover: "plan_sponsor_approver",
  payrollAdmin: "payroll_admin",
  readOnlyAuditor: "read_only_auditor",
  participant: "participant",
  apiClient: "api_client",
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

const P = PERMISSIONS;

export const ROLE_DEFINITIONS: Record<
  RoleKey,
  { name: string; description: string; permissions: PermissionKey[] }
> = {
  [ROLES.platformSuperAdmin]: {
    name: "Platform Super Admin",
    description: "Full access to all platform operations.",
    permissions: Object.values(P),
  },
  [ROLES.platformSupportAdmin]: {
    name: "Platform Support Admin",
    description: "Read-only platform access for support and triage.",
    permissions: [
      P.organizationRead,
      P.companyRead,
      P.planRead,
      P.payrollConnectionRead,
      P.auditRead,
    ],
  },
  [ROLES.firmAdmin]: {
    name: "Firm Admin",
    description: "Manages a TPA/RIA firm — companies, plans, users, integrations.",
    permissions: [
      P.organizationRead,
      P.companyRead,
      P.companyUpdate,
      P.planRead,
      P.planUpdate,
      P.planRuleVersionCreate,
      P.payrollConnectionCreate,
      P.payrollConnectionRead,
      P.payrollSyncRun,
      P.payrollFileUpload,
      P.payrollFileMap,
      P.payrollFileParse,
      P.payrollFileScanOverride,
      P.validationRun,
      P.exceptionResolve,
      P.contributionGenerate,
      P.contributionSubmit,
      P.auditRead,
      P.userInvite,
      P.roleManage,
    ],
  },
  [ROLES.firmOperationsUser]: {
    name: "Firm Operations User",
    description: "Day-to-day payroll cycle operator at a TPA/RIA firm.",
    permissions: [
      P.companyRead,
      P.planRead,
      P.payrollConnectionRead,
      P.payrollSyncRun,
      P.payrollFileUpload,
      P.payrollFileMap,
      P.payrollFileParse,
      P.validationRun,
      P.exceptionResolve,
      P.contributionGenerate,
      P.auditRead,
    ],
  },
  [ROLES.planSponsorAdmin]: {
    name: "Plan Sponsor Admin",
    description: "Employer-side admin who manages users and approves contributions.",
    permissions: [
      P.companyRead,
      P.planRead,
      P.payrollFileUpload,
      P.validationRun,
      P.exceptionResolve,
      P.contributionApprove,
      P.contributionSubmit,
      P.auditRead,
      P.userInvite,
    ],
  },
  [ROLES.planSponsorApprover]: {
    name: "Plan Sponsor Approver",
    description: "Authorized signer for sponsor approval certifications.",
    permissions: [
      P.companyRead,
      P.planRead,
      P.contributionApprove,
      P.auditRead,
    ],
  },
  [ROLES.payrollAdmin]: {
    name: "Payroll Admin",
    description: "Uploads payroll files and manages mappings; cannot approve.",
    permissions: [
      P.companyRead,
      P.planRead,
      P.payrollFileUpload,
      P.payrollFileMap,
      P.payrollFileParse,
      P.validationRun,
    ],
  },
  [ROLES.readOnlyAuditor]: {
    name: "Read-Only Auditor",
    description: "External or internal auditor with read-only access.",
    permissions: [
      P.organizationRead,
      P.companyRead,
      P.planRead,
      P.auditRead,
    ],
  },
  [ROLES.participant]: {
    name: "Participant",
    description: "Plan participant with view-only access to their own data (future).",
    permissions: [],
  },
  [ROLES.apiClient]: {
    name: "API Client",
    description: "Service account credential. Permissions assigned per-client.",
    permissions: [],
  },
};
