// Resend provider. Stubbed in Phase 1 — selecting EMAIL_DRIVER=resend will
// throw at first send with a pointer to this file so the operator wires it
// before relying on it for production.
//
// Wiring checklist:
//
//   1. npm install resend
//
//   2. Create a verified sending domain (DKIM + SPF) in the Resend dashboard.
//      "Verified" is a hard requirement — Resend will reject sends from an
//      unverified domain.
//
//   3. Mint a "send-only" API key scoped to that domain. Put it in the
//      secrets manager as RESEND_API_KEY (see lib/secrets/).
//
//   4. Set EMAIL_FROM in env to a sender on the verified domain, e.g.
//      "Nevatas <noreply@yourdomain.com>".
//
//   5. Replace the body of send() below with the Resend SDK call noted
//      inline. Tag every send with template + recipient userId for the
//      Resend dashboard's filter UI.
//
//   6. Subscribe to webhooks (delivered / bounced / complained) and post
//      them to /api/webhooks/email/resend so the EmailMessage row gets the
//      true downstream verdict.

import type { EmailMessage, EmailProvider, SendResult } from "@/lib/email/driver";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;

  constructor() {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY must be set when EMAIL_DRIVER=resend");
    }
  }

  async send(_message: EmailMessage): Promise<SendResult> {
    // Production implementation:
    //
    //   const resend = new Resend(process.env.RESEND_API_KEY!);
    //   const result = await resend.emails.send({
    //     from: _message.from,
    //     to: _message.to,
    //     subject: _message.subject,
    //     html: _message.html,
    //     text: _message.text,
    //     replyTo: _message.replyTo,
    //   });
    //   if (result.error) throw new Error(`Resend rejected send: ${result.error.message}`);
    //   return { providerMessageId: result.data?.id };
    throw new Error(
      "ResendEmailProvider.send is not implemented. See lib/email/resend-provider.ts for the wiring checklist.",
    );
  }
}
