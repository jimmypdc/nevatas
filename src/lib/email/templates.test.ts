import { describe, expect, it } from "vitest";

import { renderTemplate, TEMPLATES } from "@/lib/email/templates";

describe("renderTemplate", () => {
  it("password reset includes the reset URL and expiry window", () => {
    const out = renderTemplate(TEMPLATES.passwordReset, {
      recipientName: "Pat",
      resetUrl: "https://app.nevatas.local/reset?token=abc",
      expiresInMinutes: 30,
    });
    expect(out.subject).toMatch(/reset your password/i);
    expect(out.text).toContain("Hi Pat,");
    expect(out.text).toContain("https://app.nevatas.local/reset?token=abc");
    expect(out.text).toContain("30 minutes");
    // HTML auto-links the URL.
    expect(out.html).toContain('href="https://app.nevatas.local/reset?token=abc"');
  });

  it("user invite handles both named and anonymous recipients", () => {
    const named = renderTemplate(TEMPLATES.userInvite, {
      recipientName: "Pat",
      inviterName: "Sam",
      organizationName: "Acme TPA",
      acceptUrl: "https://app/invite/abc",
      expiresInDays: 7,
    });
    expect(named.text).toContain("Hi Pat,");

    const anon = renderTemplate(TEMPLATES.userInvite, {
      recipientName: null,
      inviterName: "Sam",
      organizationName: "Acme TPA",
      acceptUrl: "https://app/invite/abc",
      expiresInDays: 7,
    });
    expect(anon.text).toContain("Hi,");
    expect(anon.subject).toContain("Acme TPA");
  });

  it("approval-required surfaces the company + payroll date", () => {
    const out = renderTemplate(TEMPLATES.approvalRequired, {
      recipientName: "Pat",
      companyName: "Acme Industries",
      payrollDate: "2026-04-15",
      runUrl: "https://app/runs/xyz",
    });
    expect(out.subject).toContain("Acme Industries");
    expect(out.subject).toContain("2026-04-15");
    expect(out.text).toContain("https://app/runs/xyz");
  });

  it("escapes HTML metacharacters in user-supplied content", () => {
    const out = renderTemplate(TEMPLATES.userInvite, {
      recipientName: "<script>alert(1)</script>",
      inviterName: "Sam",
      organizationName: "Acme & Co",
      acceptUrl: "https://app/invite/abc",
      expiresInDays: 7,
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("Acme &amp; Co");
  });
});
