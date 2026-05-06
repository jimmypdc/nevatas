import { describe, expect, it } from "vitest";

import { getAuditContext, runWithAuditContext, setAuditContext } from "./context";

describe("audit context (AsyncLocalStorage)", () => {
  it("returns undefined when no context is set", () => {
    // runWithAuditContext explicitly scopes; outside any .run(), no store.
    expect(getAuditContext()).toBeUndefined();
  });

  it("propagates impersonatedBy through async chains", async () => {
    await runWithAuditContext({ impersonatedBy: "admin-1" }, async () => {
      expect(getAuditContext()?.impersonatedBy).toBe("admin-1");
      await Promise.resolve();
      expect(getAuditContext()?.impersonatedBy).toBe("admin-1");
    });
    // Outside the .run(), the store is gone.
    expect(getAuditContext()).toBeUndefined();
  });

  it("isolates concurrent contexts", async () => {
    const seen: Array<string | undefined> = [];
    await Promise.all([
      runWithAuditContext({ impersonatedBy: "admin-A" }, async () => {
        await Promise.resolve();
        seen.push(getAuditContext()?.impersonatedBy);
      }),
      runWithAuditContext({ impersonatedBy: "admin-B" }, async () => {
        await Promise.resolve();
        seen.push(getAuditContext()?.impersonatedBy);
      }),
    ]);
    expect(seen.sort()).toEqual(["admin-A", "admin-B"]);
  });

  it("setAuditContext binds the current async chain (no callback)", async () => {
    await runWithAuditContext({}, async () => {
      // Simulates requireActor() calling setAuditContext after computing actor.
      setAuditContext({ impersonatedBy: "admin-late" });
      await Promise.resolve();
      expect(getAuditContext()?.impersonatedBy).toBe("admin-late");
    });
  });
});
