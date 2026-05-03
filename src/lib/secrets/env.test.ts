import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _resetSecretsForTests, getSecret, loadSecretsIntoEnv } from "@/lib/secrets";

describe("EnvSecretsDriver", () => {
  const original: Record<string, string | undefined> = {};
  const TOUCH = ["TEST_SECRET_A", "TEST_SECRET_B", "TEST_SECRET_MISSING", "SECRETS_DRIVER"];

  beforeEach(() => {
    for (const k of TOUCH) original[k] = process.env[k];
    process.env.SECRETS_DRIVER = "env";
    _resetSecretsForTests();
  });

  afterEach(() => {
    for (const k of TOUCH) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
    _resetSecretsForTests();
  });

  it("returns the value of a present env var", async () => {
    process.env.TEST_SECRET_A = "rabbit";
    expect(await getSecret("TEST_SECRET_A")).toBe("rabbit");
  });

  it("throws a clear error when a secret is missing", async () => {
    delete process.env.TEST_SECRET_MISSING;
    await expect(getSecret("TEST_SECRET_MISSING")).rejects.toThrow(/not set in the environment/);
  });

  it("treats empty string as missing", async () => {
    process.env.TEST_SECRET_A = "";
    await expect(getSecret("TEST_SECRET_A")).rejects.toThrow();
  });

  it("loadSecretsIntoEnv leaves already-set vars untouched and returns populated names", async () => {
    process.env.TEST_SECRET_A = "preset";
    delete process.env.TEST_SECRET_B;
    const populated = await loadSecretsIntoEnv(["TEST_SECRET_A", "TEST_SECRET_B"]);
    // env driver can't fetch a value for B; populated stays empty for it.
    expect(populated).toEqual([]);
    expect(process.env.TEST_SECRET_A).toBe("preset");
    expect(process.env.TEST_SECRET_B).toBeUndefined();
  });
});

describe("Driver selection", () => {
  const original = process.env.SECRETS_DRIVER;

  afterEach(() => {
    if (original === undefined) delete process.env.SECRETS_DRIVER;
    else process.env.SECRETS_DRIVER = original;
    _resetSecretsForTests();
  });

  it("rejects an unknown SECRETS_DRIVER value", async () => {
    process.env.SECRETS_DRIVER = "doppler";
    _resetSecretsForTests();
    await expect(getSecret("TEST_SECRET_A")).rejects.toThrow(/Unknown SECRETS_DRIVER/);
  });
});
