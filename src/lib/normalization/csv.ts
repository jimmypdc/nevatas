// CSV parsing using PapaParse. Returns headers + ordered rows of raw strings.
// Normalization is a separate step so we can preserve raw source data verbatim.

import Papa from "papaparse";

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
  errors: { row: number; message: string }[];
};

export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const headers = result.meta.fields ?? [];
  const errors = result.errors.map((e) => ({
    row: e.row ?? -1,
    message: e.message,
  }));

  return { headers, rows: result.data, errors };
}

// Suggest a mapping from canonical field key → source header by alias matching.
// Case- and whitespace-insensitive. Unmapped canonical fields are omitted.
export function suggestMapping(
  headers: string[],
  fields: { key: string; aliases: string[] }[],
): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, " ").trim();
  const headerMap = new Map(headers.map((h) => [norm(h), h]));

  const out: Record<string, string> = {};
  for (const f of fields) {
    for (const alias of [f.key, ...f.aliases]) {
      const hit = headerMap.get(norm(alias));
      if (hit) {
        out[f.key] = hit;
        break;
      }
    }
  }
  return out;
}
