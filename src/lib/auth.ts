// NextAuth v5 setup. Email + password (Argon2id) for MVP; SSO/MFA stubs for later.
//
// Pre- and post-authorize hooks call into login-throttle to:
//   - Reject when the account is locked, the user is disabled, or the source
//     IP has hit the failure-rate ceiling.
//   - Record every attempt (success and failure) in LoginAttempt for SOC 2
//     evidence and brute-force detection.
//   - Apply a constant-time floor on every authorize() call so response timing
//     does not leak account existence.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";

import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto/hashing";
import { preLoginCheck, recordLoginAttempt } from "@/lib/auth/login-throttle";
import { verifyAndConsumeRecoveryCode, verifyTotpForUser } from "@/lib/auth/mfa";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { headers } from "next/headers";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Empty string is treated as "no MFA code supplied". Trim before validating.
  totp: z.string().optional(),
});

// Minimum wall time for any authorize() invocation; smooths timing differences
// between "user exists, bad password" (hits Argon2 verify) and "no such user"
// (returns immediately). 600ms is well above Argon2id verify time at our
// chosen cost params and below user-perceptible-as-laggy.
const AUTHORIZE_MIN_MS = 600;

async function readClientContext(): Promise<{ ipAddress?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return {
      ipAddress: fwd?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    };
  } catch {
    return {};
  }
}

// Read SESSION_* values directly from process.env (rather than via env())
// so this module can load at NextAuth init time before our env validator
// has run. Defaults match the env schema's defaults; any malformed value
// silently falls back to a safe shorter window.
const sessionMaxAgeHours = Math.max(
  1,
  Math.min(720, Number(process.env.SESSION_MAX_AGE_HOURS) || 8),
);
const sessionUpdateAgeMinutes = Math.max(
  1,
  Math.min(1440, Number(process.env.SESSION_UPDATE_AGE_MINUTES) || 30),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
    // Absolute hard expiry of every JWT. Even with continuous activity the
    // user must re-authenticate after this window.
    maxAge: sessionMaxAgeHours * 3600,
    // Sliding behavior: when the session is read and updateAge seconds have
    // elapsed since the JWT was minted, NextAuth re-mints with a new exp.
    // Active users effectively never expire within a maxAge window; idle
    // users hit the maxAge ceiling.
    updateAge: sessionUpdateAgeMinutes * 60,
  },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" },
      },
      authorize: async (raw) => {
        const start = Date.now();
        const finish = async <T>(value: T): Promise<T> => {
          const elapsed = Date.now() - start;
          if (elapsed < AUTHORIZE_MIN_MS) {
            await new Promise((r) => setTimeout(r, AUTHORIZE_MIN_MS - elapsed));
          }
          return value;
        };

        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return finish(null);

        const emailLower = parsed.data.email.toLowerCase();
        const totp = parsed.data.totp?.trim() ?? "";
        const client = await readClientContext();
        const ctx = { emailLower, ...client };

        const pre = await preLoginCheck(ctx);
        if (!pre.allow) {
          await recordLoginAttempt(ctx, pre.outcome, pre.reason);
          return finish(null);
        }

        const user = await db.user.findUnique({ where: { email: emailLower } });
        if (!user || !user.passwordHash) {
          await recordLoginAttempt(ctx, "unknown_user");
          return finish(null);
        }

        const ok = await verifyPassword(user.passwordHash, parsed.data.password);
        if (!ok) {
          await recordLoginAttempt(ctx, "bad_password");
          return finish(null);
        }

        // MFA gate. If the account has MFA, the TOTP field must contain
        // either a valid 6-digit TOTP code or a valid recovery code.
        if (user.mfaEnabled) {
          if (!totp) {
            await recordLoginAttempt(ctx, "mfa_required");
            return finish(null);
          }
          let mfaOk = false;
          let usedRecovery = false;
          if (/^\d{6}$/.test(totp)) {
            mfaOk = await verifyTotpForUser(user.id, totp);
          }
          if (!mfaOk) {
            // Treat anything that isn't a 6-digit code as a recovery-code
            // attempt — single-use, time-independent.
            const consumed = await verifyAndConsumeRecoveryCode(user.id, totp);
            if (consumed) {
              mfaOk = true;
              usedRecovery = true;
            }
          }
          if (!mfaOk) {
            await recordLoginAttempt(ctx, "bad_mfa");
            return finish(null);
          }
          if (usedRecovery) {
            // Find an org membership we can attribute the audit event to.
            const membership = await db.organizationUser.findFirst({
              where: { userId: user.id, status: "active" },
              select: { organizationId: true },
            });
            if (membership) {
              await writeAudit({
                organizationId: membership.organizationId,
                actorUserId: user.id,
                action: AUDIT_ACTIONS.mfaRecoveryCodeUsed,
                entityType: "user",
                entityId: user.id,
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
              }).catch(() => undefined);
            }
          }
        }

        await recordLoginAttempt(ctx, "succeeded");
        return finish({ id: user.id, email: user.email, name: user.name ?? undefined });
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.sub = user.id;
      return token;
    },
    session: async ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}
