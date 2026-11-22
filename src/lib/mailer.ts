import nodemailer from "nodemailer";

/**
 * SMTP mailer for user invites. If SMTP env vars are absent, sendInviteEmail
 * returns false and the API falls back to showing the invite link in the UI.
 * Email HTML is table-based with inline styles — email clients don't support
 * CSS variables, gradients, or web fonts.
 */

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

const BRAND = "Logistics AI Analytics";
const ACCENT = "#4353ff";
const INK = "#1f2937";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

export async function sendInviteEmail(
  to: string,
  inviteeName: string,
  inviteUrl: string,
  role: string,
  inviterName: string
): Promise<boolean> {
  if (!smtpConfigured()) return false;

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const text = [
    `Hello ${inviteeName},`,
    ``,
    `${inviterName} has invited you to join ${BRAND} as a ${roleLabel}.`,
    `${BRAND} is an analytics workspace for logistics data: dashboards, natural-language questions, and demand forecasting.`,
    ``,
    `Set your password to activate your account:`,
    inviteUrl,
    ``,
    `This invitation expires on ${expires}.`,
    `If you weren't expecting this invitation, you can ignore this email — no account will be created until you set a password.`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">

          <!-- Header: typographic wordmark, no logo -->
          <tr>
            <td style="padding:28px 40px 24px;border-bottom:1px solid ${BORDER};">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:17px;letter-spacing:0.2px;color:${INK};">
                <span style="color:${ACCENT};font-weight:bold;">Logistics</span> AI Analytics
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px 8px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 16px;font-size:15px;color:${INK};">Hello ${escapeHtml(inviteeName)},</p>
              <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:${INK};">
                <strong>${escapeHtml(inviterName)}</strong> has invited you to join
                <strong>${BRAND}</strong> as a <strong>${roleLabel}</strong>.
                Activate your account by setting a password — it takes less than a minute.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:8px 40px 8px;" align="left">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:${ACCENT};border-radius:6px;">
                    <a href="${inviteUrl}" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">
                      Set my password
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Expiry + fallback -->
          <tr>
            <td style="padding:16px 40px 28px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 12px;font-size:12px;color:${MUTED};">
                This invitation expires on <strong>${expires}</strong>.
              </p>
              <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};word-break:break-all;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${inviteUrl}" style="color:${ACCENT};text-decoration:underline;">${inviteUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid ${BORDER};font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:${MUTED};">
                You received this email because an administrator of ${BRAND} invited you.
                If you weren't expecting this invitation, you can safely ignore it — no account is created until you set a password.
              </p>
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                © ${new Date().getFullYear()} ${BRAND}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await transport.sendMail({
      from: `${BRAND} <${from}>`,
      to,
      subject: `${inviterName} invited you to ${BRAND} (${roleLabel})`,
      text,
      html,
    });
    return true;
  } catch (e) {
    console.error("[mailer] invite email failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
