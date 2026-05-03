// Object storage key conventions. All keys are scoped under the company so
// that bucket policies / IAM can isolate tenants.

export function payrollSourceKey(params: {
  companyId: string;
  fileId: string;
  fileName: string;
}): string {
  const safeName = params.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  return `companies/${params.companyId}/source/${params.fileId}/${safeName}`;
}

export function contributionOutputKey(params: {
  companyId: string;
  payrollRunId: string;
  fileId: string;
  version: number;
  fileName: string;
}): string {
  const safeName = params.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  return `companies/${params.companyId}/contributions/${params.payrollRunId}/v${params.version}/${params.fileId}_${safeName}`;
}
