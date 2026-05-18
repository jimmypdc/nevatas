import { describe, expect, it } from "vitest";

import { csvSafeField, csvSafeFile, csvSafeLine } from "./export";

describe("csvSafeField (formula-injection + RFC 4180)", () => {
  it("returns plain strings unchanged", () => {
    expect(csvSafeField("hello")).toBe("hello");
    expect(csvSafeField("42")).toBe("42");
  });

  it("prefixes formula-evaluable strings with apostrophe", () => {
    expect(csvSafeField("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(csvSafeField("+1234567")).toBe("'+1234567");
    expect(csvSafeField("-5")).toBe("'-5");
    expect(csvSafeField("@johndoe")).toBe("'@johndoe");
    expect(csvSafeField("\tHello")).toBe("'\tHello");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    expect(csvSafeField("a,b")).toBe('"a,b"');
    expect(csvSafeField('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvSafeField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("combines formula-escape with RFC 4180 quoting when needed", () => {
    // "=cmd|'/c calc'!A1" — needs both apostrophe-prefix and double-quote wrap.
    expect(csvSafeField("=cmd,calc")).toBe(`"'=cmd,calc"`);
  });

  it("serializes Date as ISO 8601", () => {
    const d = new Date("2026-05-17T12:34:56.000Z");
    expect(csvSafeField(d)).toBe("2026-05-17T12:34:56.000Z");
  });

  it("emits empty string for null/undefined/empty", () => {
    expect(csvSafeField(null)).toBe("");
    expect(csvSafeField(undefined)).toBe("");
    expect(csvSafeField("")).toBe("");
  });

  it("coerces numbers, booleans", () => {
    expect(csvSafeField(42)).toBe("42");
    expect(csvSafeField(0)).toBe("0");
    expect(csvSafeField(true)).toBe("true");
    expect(csvSafeField(false)).toBe("false");
  });
});

describe("csvSafeLine + csvSafeFile", () => {
  it("joins fields with commas", () => {
    expect(csvSafeLine(["a", "b", "c"])).toBe("a,b,c");
  });

  it("emits CRLF-terminated document with trailing newline", () => {
    const out = csvSafeFile(
      ["name", "email"],
      [
        ["Alice", "alice@example.com"],
        ["Bob", "=cmd|/c calc"],
      ],
    );
    expect(out).toBe(
      `name,email\r\nAlice,alice@example.com\r\nBob,'=cmd|/c calc\r\n`,
    );
  });

  it("handles empty data rows", () => {
    expect(csvSafeFile(["x"], [])).toBe("x\r\n");
  });
});
