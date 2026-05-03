// Password policy. Used at signup, password reset, and password change. Returns
// a structured result so the UI can show specific guidance.
//
// Policy:
//   - >= 12 characters
//   - >= 3 of the 4 character classes (lower, upper, digit, symbol)
//   - not in the embedded common-passwords list
//   - not previously breached per HIBP k-anonymity API (fail-open on network
//     error so a transient HIBP outage does not lock everyone out)
//
// HIBP check: https://api.pwnedpasswords.com/range/<first 5 chars of sha1>
// Sends only the SHA-1 prefix; the response is the list of suffixes seen in
// breaches. Industry-standard k-anonymity flow.

import { createHash } from "node:crypto";

const MIN_LEN = 12;

const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "letmein",
  "welcome",
  "qwerty",
  "qwerty123",
  "iloveyou",
  "admin",
  "administrator",
  "changeme",
  "abc12345",
  "123456789",
  "1234567890",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "trustno1",
]);

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; reasons: string[] };

export async function validatePassword(
  plaintext: string,
  options: { skipHibp?: boolean } = {},
): Promise<PasswordPolicyResult> {
  const reasons: string[] = [];

  if (plaintext.length < MIN_LEN) {
    reasons.push(`Must be at least ${MIN_LEN} characters`);
  }
  const classes = countCharClasses(plaintext);
  if (classes < 3) {
    reasons.push("Must include at least three of: lowercase, uppercase, digit, symbol");
  }
  if (COMMON.has(plaintext.toLowerCase())) {
    reasons.push("Password is on the common-password list");
  }

  if (reasons.length === 0 && !options.skipHibp) {
    const breached = await hibpBreached(plaintext);
    if (breached === true) reasons.push("Password appears in known breach corpora");
    // breached === null means HIBP was unreachable; fail-open.
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

function countCharClasses(s: string): number {
  let n = 0;
  if (/[a-z]/.test(s)) n++;
  if (/[A-Z]/.test(s)) n++;
  if (/\d/.test(s)) n++;
  if (/[^A-Za-z0-9]/.test(s)) n++;
  return n;
}

// Returns true if the password is in the HIBP corpus, false if confirmed not,
// null if HIBP could not be reached (caller should treat as inconclusive).
export async function hibpBreached(plaintext: string): Promise<boolean | null> {
  try {
    const sha1 = createHash("sha1").update(plaintext).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const ctrl = AbortSignal.timeout(2_500);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: ctrl,
    });
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.split(/\r?\n/)) {
      const [hashSuffix, countStr] = line.split(":");
      if (!hashSuffix || !countStr) continue;
      if (hashSuffix.trim().toUpperCase() === suffix && Number(countStr) > 0) {
        return true;
      }
    }
    return false;
  } catch {
    return null;
  }
}
