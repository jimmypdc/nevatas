// Canonical field definitions for the payroll-contribution import type. Each
// canonical field has a stable key (used in the normalized record), one or more
// header aliases (used to auto-suggest mappings), a parser, and required-ness.
//
// To support a new payroll provider's CSV export, add aliases here rather than
// adding provider-specific logic to the normalization engine.

export type CanonicalFieldType = "string" | "decimal" | "date" | "ssn";

export type CanonicalFieldDef = {
  key: string;
  label: string;
  type: CanonicalFieldType;
  required: boolean;
  aliases: string[]; // case-insensitive header matches
  description?: string;
};

export const CONTRIBUTION_FIELDS: CanonicalFieldDef[] = [
  {
    key: "externalEmployeeId",
    label: "Employee ID",
    type: "string",
    required: true,
    aliases: ["employee id", "employee_id", "emp id", "emp_id", "employee number", "employee no"],
  },
  {
    key: "ssn",
    label: "SSN",
    type: "ssn",
    required: false,
    aliases: ["ssn", "social security number", "social", "tin"],
  },
  {
    key: "firstName",
    label: "First Name",
    type: "string",
    required: false,
    aliases: ["first name", "first_name", "fname", "given name"],
  },
  {
    key: "lastName",
    label: "Last Name",
    type: "string",
    required: false,
    aliases: ["last name", "last_name", "lname", "surname", "family name"],
  },
  {
    key: "payrollDate",
    label: "Payroll Date",
    type: "date",
    required: true,
    aliases: ["payroll date", "pay date", "check date", "paycheck date"],
  },
  {
    key: "payPeriodStart",
    label: "Pay Period Start",
    type: "date",
    required: false,
    aliases: ["pay period start", "period start", "period_start"],
  },
  {
    key: "payPeriodEnd",
    label: "Pay Period End",
    type: "date",
    required: false,
    aliases: ["pay period end", "period end", "period_end"],
  },
  {
    key: "grossCompensation",
    label: "Gross Compensation",
    type: "decimal",
    required: true,
    aliases: ["gross", "gross pay", "gross compensation", "gross_comp", "total gross"],
  },
  {
    key: "eligibleCompensation",
    label: "Eligible Compensation",
    type: "decimal",
    required: false,
    aliases: ["eligible comp", "eligible compensation", "401k_eligible", "plan compensation"],
  },
  {
    key: "preTaxDeferral",
    label: "Pre-Tax Deferral",
    type: "decimal",
    required: false,
    aliases: ["401k", "pretax 401k", "pre-tax", "pre_tax", "401k_pretax", "traditional 401k"],
  },
  {
    key: "rothDeferral",
    label: "Roth Deferral",
    type: "decimal",
    required: false,
    aliases: ["roth", "roth 401k", "401k_roth", "roth deferral"],
  },
  {
    key: "afterTaxContribution",
    label: "After-Tax Contribution",
    type: "decimal",
    required: false,
    aliases: ["after tax", "after-tax", "after_tax", "voluntary aftertax"],
  },
  {
    key: "employerMatch",
    label: "Employer Match",
    type: "decimal",
    required: false,
    aliases: ["match", "employer match", "er_match", "company match"],
  },
  {
    key: "safeHarborMatch",
    label: "Safe Harbor Match",
    type: "decimal",
    required: false,
    aliases: ["safe harbor match", "sh_match", "safeharbor match"],
  },
  {
    key: "safeHarborNonelective",
    label: "Safe Harbor Nonelective",
    type: "decimal",
    required: false,
    aliases: ["safe harbor nonelective", "sh_nec", "qnec", "nonelective"],
  },
  {
    key: "profitSharing",
    label: "Profit Sharing",
    type: "decimal",
    required: false,
    aliases: ["profit sharing", "profit_sharing", "ps"],
  },
  {
    key: "loanRepayment",
    label: "Loan Repayment",
    type: "decimal",
    required: false,
    aliases: ["loan repayment", "loan", "loan_repay", "401k loan"],
  },
];

export function fieldByKey(key: string): CanonicalFieldDef | undefined {
  return CONTRIBUTION_FIELDS.find((f) => f.key === key);
}
