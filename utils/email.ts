import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE,
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Templates

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SHRTNR</title>
</head>
<body style="margin:0;padding:0;background:#0E0E0E;font-family:'Courier New',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0E0E0E;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
          style="background:#141414;border:1px solid rgba(73,72,71,0.25);border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding:32px 40px 24px;">
              <span style="font-size:22px;font-weight:900;letter-spacing:0.2em;color:#BD9DFF;">
                SHRTNR
              </span>
              <div style="width:40px;height:2px;background:#BD9DFF;margin:12px auto 0;border-radius:2px;"></div>
            </td>
          </tr>

          ${content}

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid rgba(73,72,71,0.25);">
              <p style="margin:0;font-size:10px;letter-spacing:0.15em;color:#3F3F46;text-align:center;">
                © ${new Date().getFullYear()} SHRTNR PRECISION SYSTEMS. HYPER-PRECISION VOID PROTOCOL.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function otpEmailHtml(otp: string, username: string): string {
  const digits = otp.split("");

  const digitCells = digits
    .map(
      (d, i) => `
        ${i === 3 ? `<td style="width:24px;"></td>` : ""}
        <td align="center"
          style="width:52px;height:64px;background:#1C1C1C;
                 border:1px solid rgba(73,72,71,0.25);border-radius:10px;
                 font-size:36px;font-weight:700;color:#BD9DFF;
                 font-family:'Courier New',monospace;letter-spacing:0;">
          ${d}
        </td>
        ${i < digits.length - 1 && i !== 2 ? `<td style="width:8px;"></td>` : ""}
      `,
    )
    .join("");

  return baseLayout(`
    <!-- Title -->
    <tr>
      <td align="center" style="padding:8px 40px 4px;">
        <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;letter-spacing:-0.01em;font-family:'Courier New',monospace;">
          Verify your identity
        </h1>
        <p style="margin:10px 0 0;font-size:10px;font-weight:700;letter-spacing:0.22em;color:#71717A;text-transform:uppercase;font-family:'Courier New',monospace;">
          Security protocol triggered
        </p>
      </td>
    </tr>

    <!-- OTP box -->
    <tr>
      <td style="padding:28px 32px 8px;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            ${digitCells}
          </tr>
        </table>
      </td>
    </tr>

    <!-- Expiry -->
    <tr>
      <td style="padding:12px 32px 8px;">
        <div style="background:#1C1C1C;border:1px solid rgba(73,72,71,0.25);border-radius:8px;padding:12px 16px;text-align:center;">
          <span style="font-size:11px;font-weight:700;letter-spacing:0.15em;color:#71717A;text-transform:uppercase;font-family:'Courier New',monospace;">
            ⏱ &nbsp; Expires in 10 minutes
          </span>
        </div>
      </td>
    </tr>

    <!-- Body copy -->
    <tr>
      <td style="padding:20px 40px 8px;">
        <p style="margin:0;font-size:13px;line-height:1.7;color:#71717A;text-align:center;font-family:'Courier New',monospace;">
          Hi ${username}, a registration request for <span style="color:#BD9DFF;">Shrtnr</span> was initiated.
          Enter this code to complete verification. If you didn't request this, ignore this email.
        </p>
      </td>
    </tr>

    <!-- Support link -->
    <tr>
      <td align="center" style="padding:20px 40px 32px;">
        <a href="mailto:${process.env.SUPPORT_EMAIL || "support@shrtnr.io"}"
          style="font-size:11px;font-weight:700;letter-spacing:0.15em;color:#BD9DFF;text-decoration:none;text-transform:uppercase;font-family:'Courier New',monospace;">
          NEED HELP? CONTACT SUPPORT →
        </a>
      </td>
    </tr>
  `);
}

export function welcomeEmailHtml(username: string): string {
  return baseLayout(`
    <tr>
      <td align="center" style="padding:24px 40px 8px;">
        <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;">
          You're in, ${username}.
        </h1>
        <p style="margin:12px 0 0;font-size:10px;font-weight:700;letter-spacing:0.22em;color:#71717A;text-transform:uppercase;">
          Account initialized
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 40px 32px;">
        <p style="margin:0;font-size:13px;line-height:1.7;color:#71717A;text-align:center;">
          Your <span style="color:#BD9DFF;">SHRTNR</span> account is active.
          Start shortening links and tracking clicks from your dashboard.
        </p>
      </td>
    </tr>
  `);
}

// Sender

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailOptions) {
  await transporter.sendMail({
    from: `"SHRTNR" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}
