// AWS SES provider. Stubbed in Phase 1.
//
// Wiring checklist:
//
//   1. npm install @aws-sdk/client-sesv2
//
//   2. Verify the sending domain in SES (DKIM, MAIL FROM, SPF). New AWS
//      accounts start in the SES sandbox — request production access before
//      first real send (typically a 24h review).
//
//   3. The IAM role this app runs under needs ses:SendEmail on the
//      verified identity. Restrict the resource to that ARN; deny SendEmail
//      to other identities.
//
//   4. Set EMAIL_FROM and AWS_REGION; SES uses the SDK default credential
//      chain (env / instance metadata / task role) — no inline keys needed
//      in production.
//
//   5. Replace the body of send() with the SESv2 SendEmailCommand call.
//      SES returns a MessageId on success which we persist as
//      providerMessageId for tracing.
//
//   6. Set up SNS notifications for bounces + complaints. Route them to
//      a webhook that updates the EmailMessage row.

import type { EmailMessage, EmailProvider, SendResult } from "@/lib/email/driver";

export class SesEmailProvider implements EmailProvider {
  readonly name = "aws_ses" as const;

  async send(_message: EmailMessage): Promise<SendResult> {
    // Production implementation:
    //
    //   const client = new SESv2Client({ region: env().S3_REGION });
    //   const result = await client.send(new SendEmailCommand({
    //     FromEmailAddress: _message.from,
    //     Destination: { ToAddresses: [_message.to] },
    //     Content: {
    //       Simple: {
    //         Subject: { Data: _message.subject },
    //         Body: { Html: { Data: _message.html }, Text: { Data: _message.text } },
    //       },
    //     },
    //     ReplyToAddresses: _message.replyTo ? [_message.replyTo] : undefined,
    //   }));
    //   return { providerMessageId: result.MessageId };
    throw new Error(
      "SesEmailProvider.send is not implemented. See lib/email/ses-provider.ts for the wiring checklist.",
    );
  }
}
