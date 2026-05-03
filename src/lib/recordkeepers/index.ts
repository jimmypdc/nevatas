// Recordkeeper template registry. New formats register a stable key here
// and become available to plans via PlanRules.outputFormat.

import { empowerV1 } from "@/lib/recordkeepers/templates/empower-v1";
import { fidelityV1 } from "@/lib/recordkeepers/templates/fidelity-v1";
import { nevatasV1 } from "@/lib/recordkeepers/templates/nevatas-v1";
import type { RecordkeeperTemplate } from "@/lib/recordkeepers/template";

export const TEMPLATE_REGISTRY: RecordkeeperTemplate[] = [
  nevatasV1,
  empowerV1,
  fidelityV1,
];

export const DEFAULT_TEMPLATE_KEY = nevatasV1.key;

export function templateByKey(key: string): RecordkeeperTemplate | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.key === key);
}

export function templateOrDefault(key: string | null | undefined): RecordkeeperTemplate {
  if (!key) return nevatasV1;
  const found = templateByKey(key);
  return found ?? nevatasV1;
}

export type { RecordkeeperTemplate, RenderInput, RenderedFile, ContributionRow } from "@/lib/recordkeepers/template";
