// Job handler: deliver a queued EmailMessage row via the configured provider.

import { JOB_TYPES, registerHandler } from "@/lib/jobs/registry";
import { deliverQueuedEmail } from "@/lib/email/send";

registerHandler(JOB_TYPES.sendEmail, async (payload) => {
  await deliverQueuedEmail(payload.emailMessageId, payload.replyTo ?? null);
});
