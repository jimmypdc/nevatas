import { describe, expect, it } from "vitest";

import { assertBackupReportAuth } from "./backup-verification";

// The constant-time path is exercised end-to-end by the integration test;
// here we cover the cheap-to-test failure modes that don't require an
// env-cache reset.
describe("assertBackupReportAuth (failure modes)", () => {
  it("refuses a missing Authorization header", () => {
    expect(() => assertBackupReportAuth(null)).toThrow();
  });

  it("refuses a non-Bearer Authorization scheme", () => {
    expect(() => assertBackupReportAuth("Token foo")).toThrow();
    expect(() => assertBackupReportAuth("Basic abc")).toThrow();
  });

  it("refuses an empty Bearer value", () => {
    expect(() => assertBackupReportAuth("Bearer ")).toThrow();
  });
});
