// Email provider selection. Process-wide singleton chosen by EMAIL_DRIVER.

import { ConsoleEmailProvider } from "@/lib/email/console-provider";
import type { EmailProvider } from "@/lib/email/driver";
import { ResendEmailProvider } from "@/lib/email/resend-provider";
import { SesEmailProvider } from "@/lib/email/ses-provider";

let cached: EmailProvider | null = null;

function build(): EmailProvider {
  const driver = process.env.EMAIL_DRIVER ?? "console";
  switch (driver) {
    case "console":
      return new ConsoleEmailProvider();
    case "resend":
      return new ResendEmailProvider();
    case "aws_ses":
      return new SesEmailProvider();
    default:
      throw new Error(`Unknown EMAIL_DRIVER=${driver}`);
  }
}

export function emailProvider(): EmailProvider {
  if (!cached) cached = build();
  return cached;
}

export function _resetEmailProviderForTests(): void {
  cached = null;
}

export type { EmailProvider, EmailMessage, SendResult } from "@/lib/email/driver";
