// Send service. Three entry points:
//
//   - sendEmail        — synchronous; renders + persists EmailMessage row +
//                        invokes the provider inline. Use for routes where
//                        the user is waiting (rare — most flows should
//                        enqueue instead).
//
//   - enqueueEmail     — preferred; persists the row in queued state and
//                        kicks off a background job that calls deliverEmail.
//                        Returns immediately; the worker absorbs provider
//                        latency and retries.
//
//   - deliverEmail     — internal, called by the worker handler. Looks up
//                        the row, renders, sends, updates status.
//
// Every send writes an audit event so SOC 2 evidence shows who sent what to
// whom and when.

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { emailProvider } from "@/lib/email";
import { renderTemplate, type TemplateName, type TemplateParams } from "@/lib/email/templates";
import { enqueueJob } from "@/lib/jobs/queue";
import { JOB_TYPES } from "@/lib/jobs/registry";

export type SendEmailInput<T extends TemplateName> = {
  template: T;
  params: TemplateParams[T];
  to: string;
  recipientUserId?: string | null;
  organizationId?: string | null;
  replyTo?: string;
  // Optional dedup key — when supplied, repeated calls within the
  // BackgroundJob idempotency window deliver only one email. Useful for
  // notification fan-outs where the same business event might fire twice.
  dedupKey?: string;
};

function fromAddress(): string {
  const f = process.env.EMAIL_FROM;
  if (!f) throw new Error("EMAIL_FROM must be set; format: \"Name <addr@domain>\"");
  return f;
}

// ---------- Synchronous send ----------

export async function sendEmail<T extends TemplateName>(input: SendEmailInput<T>) {
  const rendered = renderTemplate(input.template, input.params);
  const row = await db.emailMessage.create({
    data: {
      organizationId: input.organizationId ?? null,
      recipientUserId: input.recipientUserId ?? null,
      toEmail: input.to,
      fromEmail: fromAddress(),
      template: input.template,
      subject: rendered.subject,
      templateParamsJson: input.params as Prisma.InputJsonValue,
    },
  });

  try {
    const result = await emailProvider().send({
      from: fromAddress(),
      to: input.to,
      replyTo: input.replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await db.emailMessage.update({
      where: { id: row.id },
      data: {
        status: "sent",
        sentAt: new Date(),
        providerName: emailProvider().name,
        providerMessageId: result.providerMessageId ?? null,
      },
    });
    await writeAuditFor(row.id, "sent", input);
    return { id: row.id, status: "sent" as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.emailMessage.update({
      where: { id: row.id },
      data: { status: "failed", errorMessage: message.slice(0, 4000), providerName: emailProvider().name },
    });
    await writeAuditFor(row.id, "failed", input, message);
    throw err;
  }
}

async function writeAuditFor<T extends TemplateName>(
  emailId: string,
  status: "sent" | "failed",
  input: SendEmailInput<T>,
  errorMessage?: string,
) {
  if (!input.organizationId) return; // org-less notifications skip audit
  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: undefined,
    actorType: "system",
    action: status === "sent" ? AUDIT_ACTIONS.notificationEmailSent : AUDIT_ACTIONS.notificationEmailFailed,
    entityType: "email_message",
    entityId: emailId,
    metadata: {
      template: input.template,
      recipientUserId: input.recipientUserId ?? null,
      provider: emailProvider().name,
      ...(errorMessage ? { errorMessage } : {}),
    },
  });
}

// ---------- Async via background job ----------

export async function enqueueEmail<T extends TemplateName>(input: SendEmailInput<T>) {
  const rendered = renderTemplate(input.template, input.params);
  const row = await db.emailMessage.create({
    data: {
      organizationId: input.organizationId ?? null,
      recipientUserId: input.recipientUserId ?? null,
      toEmail: input.to,
      fromEmail: fromAddress(),
      template: input.template,
      subject: rendered.subject,
      templateParamsJson: input.params as Prisma.InputJsonValue,
    },
  });

  await enqueueJob({
    jobType: JOB_TYPES.sendEmail,
    payload: { emailMessageId: row.id, replyTo: input.replyTo ?? null },
    context: {
      organizationId: input.organizationId ?? "system",
      companyId: null,
      actorUserId: input.recipientUserId ?? null,
    },
    idempotencyKey: input.dedupKey ? `email:${input.dedupKey}` : undefined,
  });

  return { id: row.id, status: "queued" as const };
}

// ---------- Worker entry point (called by the job handler) ----------

export async function deliverQueuedEmail(emailMessageId: string, replyTo: string | null) {
  const row = await db.emailMessage.findUnique({ where: { id: emailMessageId } });
  if (!row) throw new Error(`EmailMessage ${emailMessageId} not found`);
  if (row.status === "sent") return; // already delivered; idempotent

  const params = (row.templateParamsJson ?? {}) as Record<string, unknown>;
  const rendered = renderTemplate(row.template as TemplateName, params as never);

  const result = await emailProvider().send({
    from: row.fromEmail,
    to: row.toEmail,
    replyTo: replyTo ?? undefined,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  await db.emailMessage.update({
    where: { id: row.id },
    data: {
      status: "sent",
      sentAt: new Date(),
      providerName: emailProvider().name,
      providerMessageId: result.providerMessageId ?? null,
    },
  });
  if (row.organizationId) {
    await writeAudit({
      organizationId: row.organizationId,
      actorType: "system",
      action: AUDIT_ACTIONS.notificationEmailSent,
      entityType: "email_message",
      entityId: row.id,
      metadata: { template: row.template, recipientUserId: row.recipientUserId, provider: emailProvider().name },
    });
  }
}
