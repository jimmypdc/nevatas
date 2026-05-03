import { describe, expect, it } from "vitest";

import { businessDaysBetween, isWeekend } from "@/lib/validation/business-days";

describe("isWeekend", () => {
  it("classifies Saturday and Sunday as weekend", () => {
    expect(isWeekend(new Date("2026-04-25T00:00:00Z"))).toBe(true); // Sat
    expect(isWeekend(new Date("2026-04-26T00:00:00Z"))).toBe(true); // Sun
  });
  it("classifies Mon–Fri as not weekend", () => {
    for (const iso of [
      "2026-04-20T00:00:00Z", // Mon
      "2026-04-21T00:00:00Z",
      "2026-04-22T00:00:00Z",
      "2026-04-23T00:00:00Z",
      "2026-04-24T00:00:00Z", // Fri
    ]) {
      expect(isWeekend(new Date(iso))).toBe(false);
    }
  });
});

describe("businessDaysBetween", () => {
  it("returns 0 for same day", () => {
    const d = new Date("2026-04-22T00:00:00Z");
    expect(businessDaysBetween(d, d)).toBe(0);
  });

  it("counts a single business day", () => {
    expect(
      businessDaysBetween(new Date("2026-04-20T00:00:00Z"), new Date("2026-04-21T00:00:00Z")),
    ).toBe(1);
  });

  it("skips a weekend (Friday → Monday is 1 business day)", () => {
    expect(
      businessDaysBetween(new Date("2026-04-24T00:00:00Z"), new Date("2026-04-27T00:00:00Z")),
    ).toBe(1);
  });

  it("counts a full work week as 5 business days", () => {
    expect(
      businessDaysBetween(new Date("2026-04-20T00:00:00Z"), new Date("2026-04-27T00:00:00Z")),
    ).toBe(5);
  });

  it("returns 0 when to <= from", () => {
    expect(
      businessDaysBetween(new Date("2026-04-22T00:00:00Z"), new Date("2026-04-21T00:00:00Z")),
    ).toBe(0);
  });
});
