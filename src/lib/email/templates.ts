// Email templates. Each template is a typed function (params -> rendered).
// Two outputs per render: html (for clients that support it) and text (for
// accessibility, deliverability, and as a fallback). Subjects are also
// returned so the call site does not need to maintain a parallel string
// table.
//
// We deliberately keep templates as pure TS functions rather than pulling
// in MJML / react-email — readable, easy to audit, no runtime surprises.
// When the design grows past ~10 templates, swap to react-email and rewire
// the renderTemplate map; the public API stays the same.

const APP_NAME = "Nevatas";

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

// ---------- Templates ----------

export const TEMPLATES = {
  passwordReset: "password_reset",
  userInvite: "user_invite",
  approvalRequired: "approval_required",
  scanInfected: "scan_infected",
  payrollSyncFailed: "payroll_sync_failed",
} as const;

export type TemplateName = (typeof TEMPLATES)[keyof typeof TEMPLATES];

export type TemplateParams = {
  [TEMPLATES.passwordReset]: { recipientName: string; resetUrl: string; expiresInMinutes: number };
  [TEMPLATES.userInvite]: {
    recipientName: string | null;
    inviterName: string;
    organizationName: string;
    acceptUrl: string;
    expiresInDays: number;
  };
  [TEMPLATES.approvalRequired]: {
    recipientName: string;
    companyName: string;
    payrollDate: string;
    runUrl: string;
  };
  [TEMPLATES.scanInfected]: {
    recipientName: string;
    fileName: string;
    fileUrl: string;
  };
  [TEMPLATES.payrollSyncFailed]: {
    recipientName: string;
    provider: string;
    errorSummary: string;
    detailsUrl: string;
  };
};

export function renderTemplate<T extends TemplateName>(
  template: T,
  params: TemplateParams[T],
): RenderedEmail {
  switch (template) {
    case TEMPLATES.passwordReset:
      return passwordReset(params as TemplateParams[typeof TEMPLATES.passwordReset]);
    case TEMPLATES.userInvite:
      return userInvite(params as TemplateParams[typeof TEMPLATES.userInvite]);
    case TEMPLATES.approvalRequired:
      return approvalRequired(params as TemplateParams[typeof TEMPLATES.approvalRequired]);
    case TEMPLATES.scanInfected:
      return scanInfected(params as TemplateParams[typeof TEMPLATES.scanInfected]);
    case TEMPLATES.payrollSyncFailed:
      return payrollSyncFailed(params as TemplateParams[typeof TEMPLATES.payrollSyncFailed]);
    default: {
      // Exhaustiveness check.
      const _never: never = template;
      throw new Error(`Unknown template: ${_never as string}`);
    }
  }
}

// ---------- Renderers ----------

function passwordReset(p: TemplateParams[typeof TEMPLATES.passwordReset]): RenderedEmail {
  const subject = `${APP_NAME}: reset your password`;
  const text = [
    `Hi ${p.recipientName},`,
    "",
    `We received a request to reset your ${APP_NAME} password.`,
    `Open the link below within ${p.expiresInMinutes} minutes:`,
    "",
    p.resetUrl,
    "",
    "If you didn't request this, you can ignore this email — your password will stay the same.",
    "",
    `— ${APP_NAME}`,
  ].join("\n");
  return { subject, html: layout(subject, text), text };
}

function userInvite(p: TemplateParams[typeof TEMPLATES.userInvite]): RenderedEmail {
  const subject = `${p.inviterName} invited you to ${p.organizationName} on ${APP_NAME}`;
  const greet = p.recipientName ? `Hi ${p.recipientName},` : "Hi,";
  const text = [
    greet,
    "",
    `${p.inviterName} has invited you to join "${p.organizationName}" on ${APP_NAME}.`,
    `Accept the invite within ${p.expiresInDays} days:`,
    "",
    p.acceptUrl,
    "",
    `— ${APP_NAME}`,
  ].join("\n");
  return { subject, html: layout(subject, text), text };
}

function approvalRequired(p: TemplateParams[typeof TEMPLATES.approvalRequired]): RenderedEmail {
  const subject = `Approval required: ${p.companyName} payroll ${p.payrollDate}`;
  const text = [
    `Hi ${p.recipientName},`,
    "",
    `A payroll cycle for ${p.companyName} dated ${p.payrollDate} is awaiting sponsor approval on ${APP_NAME}.`,
    "",
    "Open the run to review exceptions, totals, and the contribution file:",
    p.runUrl,
    "",
    `— ${APP_NAME}`,
  ].join("\n");
  return { subject, html: layout(subject, text), text };
}

function scanInfected(p: TemplateParams[typeof TEMPLATES.scanInfected]): RenderedEmail {
  const subject = `${APP_NAME}: malware scan flagged "${p.fileName}"`;
  const text = [
    `Hi ${p.recipientName},`,
    "",
    `The malware scan flagged a file you uploaded: ${p.fileName}.`,
    "It will not be parsed or released to downstream pipelines.",
    "",
    "Inspect the verdict and decide whether to override or replace the file:",
    p.fileUrl,
    "",
    `— ${APP_NAME}`,
  ].join("\n");
  return { subject, html: layout(subject, text), text };
}

function payrollSyncFailed(p: TemplateParams[typeof TEMPLATES.payrollSyncFailed]): RenderedEmail {
  const subject = `${APP_NAME}: ${p.provider} payroll sync failed`;
  const text = [
    `Hi ${p.recipientName},`,
    "",
    `A scheduled payroll sync from ${p.provider} failed.`,
    `Summary: ${p.errorSummary}`,
    "",
    "Open the connection page to retry or reconnect:",
    p.detailsUrl,
    "",
    `— ${APP_NAME}`,
  ].join("\n");
  return { subject, html: layout(subject, text), text };
}

// ---------- Shared HTML layout ----------

function layout(title: string, body: string): string {
  // Minimal, accessible HTML. Inline styles only — most clients strip
  // <style> blocks. Plaintext body is wrapped in <pre> so links stay live
  // and indentation survives.
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(
    /(https?:\/\/[^\s<]+)/g,
    (m) => `<a href="${m}" style="color:#1d4ed8;text-decoration:underline">${m}</a>`,
  );
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;background:#f9fafb;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
    <h1 style="font-size:16px;font-weight:600;margin:0 0 16px 0">${safeTitle}</h1>
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.5;margin:0">${safeBody}</pre>
  </div>
  <p style="text-align:center;font-size:12px;color:#6b7280;margin:16px 0 0 0">${APP_NAME} — compliance-grade payroll-to-401(k) operations</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
