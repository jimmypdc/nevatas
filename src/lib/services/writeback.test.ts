import { describe, expect, it } from "vitest";

import {
  WRITEBACK_REQUEST_TYPES,
  validateDeferralPayload,
  type DeferralElectionPayload,
} from "./writeback";

describe("WRITEBACK_REQUEST_TYPES", () => {
  it("ships deferral_election as a supported type", () => {
    expect(WRITEBACK_REQUEST_TYPES).toContain("deferral_election");
  });
});

describe("validateDeferralPayload", () => {
  const baseDate = new Date().toISOString().slice(0, 10);

  it("accepts a valid preTax-percent payload", () => {
    expect(() =>
      validateDeferralPayload({ effectiveDate: baseDate, preTaxPercent: 6 }),
    ).not.toThrow();
  });

  it("accepts a valid Roth-amount payload", () => {
    expect(() =>
      validateDeferralPayload({ effectiveDate: baseDate, rothAmount: 200 }),
    ).not.toThrow();
  });

  it("accepts both preTax and Roth in the same payload", () => {
    expect(() =>
      validateDeferralPayload({
        effectiveDate: baseDate,
        preTaxPercent: 4,
        rothPercent: 2,
      }),
    ).not.toThrow();
  });

  it("refuses missing effectiveDate", () => {
    expect(() =>
      validateDeferralPayload({ effectiveDate: "" as unknown as string, preTaxPercent: 6 }),
    ).toThrow(/effectiveDate/i);
  });

  it("refuses invalid effectiveDate", () => {
    expect(() =>
      validateDeferralPayload({ effectiveDate: "not-a-date", preTaxPercent: 6 }),
    ).toThrow(/valid date/i);
  });

  it("refuses preTax percent + amount together", () => {
    expect(() =>
      validateDeferralPayload({
        effectiveDate: baseDate,
        preTaxPercent: 6,
        preTaxAmount: 100,
      }),
    ).toThrow(/preTaxPercent and preTaxAmount/i);
  });

  it("refuses Roth percent + amount together", () => {
    expect(() =>
      validateDeferralPayload({
        effectiveDate: baseDate,
        rothPercent: 4,
        rothAmount: 50,
      }),
    ).toThrow(/rothPercent and rothAmount/i);
  });

  it("refuses a payload with no preTax or Roth", () => {
    expect(() =>
      validateDeferralPayload({ effectiveDate: baseDate } as DeferralElectionPayload),
    ).toThrow(/at least one/i);
  });

  it("refuses negative percent", () => {
    expect(() =>
      validateDeferralPayload({ effectiveDate: baseDate, preTaxPercent: -5 }),
    ).toThrow(/negative/i);
  });

  it("refuses percent > 100", () => {
    expect(() =>
      validateDeferralPayload({ effectiveDate: baseDate, preTaxPercent: 150 }),
    ).toThrow(/exceed 100/i);
  });

  it("refuses implausibly large amount", () => {
    expect(() =>
      validateDeferralPayload({ effectiveDate: baseDate, rothAmount: 9_999_999 }),
    ).toThrow(/implausibly large/i);
  });
});
