// Email provider interface. Implementations adapt to specific transactional
// mail services (Resend, AWS SES, Postmark, generic SMTP). Call sites
// always go through sendEmail() in lib/email/send.ts — they never see the
// provider directly — so swapping providers in production is a config flip.

export type EmailMessage = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  // Optional reply-to. Useful for invites where replies should reach the
  // inviting user, not the no-reply mailbox.
  replyTo?: string;
};

export type SendResult = {
  providerMessageId?: string;
};

export interface EmailProvider {
  readonly name: "console" | "resend" | "aws_ses" | "smtp";
  send(message: EmailMessage): Promise<SendResult>;
}
