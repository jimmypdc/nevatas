import { describe, expect, it } from "vitest";

import { JOB_PAYLOAD_SCHEMAS, JOB_TYPES, knownJobTypes } from "@/lib/jobs/registry";

describe("job registry", () => {
  it("has a payload schema for every JOB_TYPE", () => {
    for (const t of knownJobTypes()) {
      expect(JOB_PAYLOAD_SCHEMAS[t], `missing schema for ${t}`).toBeDefined();
    }
  });

  it("scanFile schema accepts a sourceFileId", () => {
    expect(
      JOB_PAYLOAD_SCHEMAS[JOB_TYPES.scanFile].safeParse({ sourceFileId: "abc" }).success,
    ).toBe(true);
  });

  it("scanFile schema rejects an empty sourceFileId", () => {
    expect(
      JOB_PAYLOAD_SCHEMAS[JOB_TYPES.scanFile].safeParse({ sourceFileId: "" }).success,
    ).toBe(false);
  });

  it("scanFile schema rejects extra unknown payloads", () => {
    expect(
      JOB_PAYLOAD_SCHEMAS[JOB_TYPES.scanFile].safeParse({ wrong: "shape" }).success,
    ).toBe(false);
  });
});
