import { describe, expect, it } from "vitest";

import { reviewCadenceDays } from "./vendor";

describe("vendor review cadence", () => {
  it("returns 90 days for critical", () => {
    expect(reviewCadenceDays("critical")).toBe(90);
  });

  it("returns 180 days for high", () => {
    expect(reviewCadenceDays("high")).toBe(180);
  });

  it("returns 365 days for medium", () => {
    expect(reviewCadenceDays("medium")).toBe(365);
  });

  it("returns 730 days for low", () => {
    expect(reviewCadenceDays("low")).toBe(730);
  });
});
