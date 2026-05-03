// Paycor adapter selector. PAYCOR_DRIVER picks between the deterministic
// mock (default; dev + tests) and the production live adapter.

import { PaycorLiveAdapter } from "@/lib/integrations/paycor/live-adapter";
import { PaycorMockAdapter } from "@/lib/integrations/paycor/mock-adapter";
import type { PayrollProviderAdapter } from "@/lib/integrations/types";

let cached: PayrollProviderAdapter | null = null;

function build(): PayrollProviderAdapter {
  const driver = process.env.PAYCOR_DRIVER ?? "mock";
  switch (driver) {
    case "mock":
      return new PaycorMockAdapter();
    case "live":
      return new PaycorLiveAdapter();
    default:
      throw new Error(`Unknown PAYCOR_DRIVER=${driver}; expected "mock" or "live"`);
  }
}

export function paycorAdapter(): PayrollProviderAdapter {
  if (!cached) cached = build();
  return cached;
}

// Test-only — flush the singleton.
export function _resetPaycorAdapterForTests(): void {
  cached = null;
}
