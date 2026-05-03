// Provider-adapter registry. The connection management service looks up
// the adapter for a PayrollConnection.provider value via this registry —
// the rest of the codebase never imports a specific adapter directly.

import { paycorAdapter } from "@/lib/integrations/paycor";
import type {
  PayrollProviderAdapter,
  PayrollProviderName,
} from "@/lib/integrations/types";

const REGISTRY: Partial<Record<PayrollProviderName, () => PayrollProviderAdapter>> = {
  paycor: paycorAdapter,
  // Phase 3:
  //   adp:        adpAdapter,
  //   gusto:      gustoAdapter,
  //   paychex:    paychexAdapter,
  //   isolved:    isolvedAdapter,
  //   quickbooks: quickbooksAdapter,
};

export function adapterFor(provider: PayrollProviderName): PayrollProviderAdapter {
  const factory = REGISTRY[provider];
  if (!factory) {
    throw new Error(
      `No adapter registered for provider "${provider}". ` +
        "Register one in lib/integrations/registry.ts.",
    );
  }
  return factory();
}

export function knownProviders(): PayrollProviderName[] {
  return Object.keys(REGISTRY) as PayrollProviderName[];
}

export type { PayrollProviderAdapter, PayrollProviderName };
