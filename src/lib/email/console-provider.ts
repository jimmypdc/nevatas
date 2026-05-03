// Dev-mode "provider": logs the email body to stdout instead of sending.
// Operators get to inspect rendered templates + verify links without
// configuring a real provider. The EmailMessage row is still written so
// the application code path is exercised end-to-end.

import { randomUUID } from "node:crypto";

import type { EmailMessage, EmailProvider, SendResult } from "@/lib/email/driver";

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console" as const;

  async send(message: EmailMessage): Promise<SendResult> {
    const id = `console-${randomUUID()}`;
    const sep = "─".repeat(64);
    console.log(
      `\n${sep}\n[email:console] -> ${message.to}\n  from: ${message.from}\n  subj: ${message.subject}\n${sep}\n${message.text}\n${sep}\n`,
    );
    return { providerMessageId: id };
  }
}
