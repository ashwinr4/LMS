import nodemailer from 'nodemailer';
import { logger } from './logger.js';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const user = process.env.SMTP_USER || 'thefallenx8@gmail.com';
    const pass = process.env.SMTP_PASS || 'diwdwcoaktrtozcl';

    if (user && pass) {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
      });
      logger.info(`Live Email Transporter initialized with ${host}:${port} (${user})`);
    } else {
      logger.warn('SMTP Credentials not fully configured. Email fallback active.');
    }
  }
  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  try {
    const mailer = getTransporter();
    const smtpUser = process.env.SMTP_USER || 'thefallenx8@gmail.com';
    const fromAddress = `"Qualiva Security" <${smtpUser}>`;

    if (!mailer) {
      logger.info(`[MOCK EMAIL DISPATCH] To: ${to} | Subject: ${subject}`);
      return { success: true, simulated: true };
    }

    const plainText = text || html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const info = await mailer.sendMail({
      from: fromAddress,
      to,
      subject,
      text: plainText,
      html,
    });

    logger.info(`Live Email Dispatched successfully: MessageId=${info.messageId} to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to dispatch email to ${to}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function sendOtpEmail(toEmail, otpCode, userName = 'Qualiva Member', context = 'Sign In') {
  const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const subject = `[Qualiva Code: ${otpCode}] Your Verification Passcode (${timeString})`;
  logger.info(`🔑 [2FA OTP GENERATED] Passcode for ${toEmail}: ${otpCode}`);
  const text = `Hello ${userName},\n\nYour Qualiva verification code is: ${otpCode}\n\nThis code will expire in 10 minutes. If you did not initiate this request, you can safely ignore this email.\n\nQualiva Enterprise Platform`;
  
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Qualiva Verification Code</title>
    </head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
        <tr>
          <td style="padding: 28px 28px 16px 28px; text-align: center; border-bottom: 1px solid #f1f5f9;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">Qualiva</h1>
            <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Security Verification</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px;">
            <p style="margin: 0 0 14px 0; font-size: 15px; color: #1e293b;">Hello <strong>${userName}</strong>,</p>
            <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.5;">
              Here is your one-time verification code for <strong>${context}</strong>:
            </p>
            
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0;">
              <tr>
                <td align="center" style="background-color: #f1f5f9; border-radius: 8px; padding: 16px 20px;">
                  <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0284c7; display: block; margin-left: 8px;">
                    ${otpCode}
                  </span>
                </td>
              </tr>
            </table>
            
            <p style="margin: 20px 0 0 0; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
              This code is valid for <strong>10 minutes</strong>.<br>If you did not request this code, no action is needed.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 28px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">
              &copy; 2026 Qualiva Enterprise. High-Stakes Learning & Governance.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
  return sendEmail({ to: toEmail, subject, html, text });
}

export async function sendWelcomeEmail(toEmail, userName = 'Qualiva Member', role = 'Student') {
  const roleName = role.replace(/_/g, ' ');
  const subject = `Welcome to Qualiva: Your Account is Active`;
  const text = `Welcome to Qualiva, ${userName}!\n\nYour enterprise account has been provisioned with ${roleName} access. You can now explore courses, complete multi-modal learning modules, and earn certified credentials.\n\nQualiva Enterprise Platform`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Welcome to Qualiva</title>
    </head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
        <tr>
          <td style="padding: 28px 28px 16px 28px; text-align: center; border-bottom: 1px solid #f1f5f9;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">Qualiva</h1>
            <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 600; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px;">Account Activated</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px;">
            <p style="margin: 0 0 14px 0; font-size: 15px; color: #1e293b;">Welcome, <strong>${userName}</strong>!</p>
            <p style="margin: 0 0 18px 0; font-size: 14px; color: #475569; line-height: 1.6;">
              Your Qualiva account is ready. You are provisioned with <strong>${roleName}</strong> access.
            </p>
            
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
              <h4 style="margin: 0 0 6px 0; font-size: 12px; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px;">Quick Overview</h4>
              <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #475569; line-height: 1.6;">
                <li>Access interactive multi-modal courses (Video, PDF, Articles & Diagrams).</li>
                <li>Track real-time lecture progression and sequential milestones.</li>
                <li>Earn verifiable certificates with tamper-proof ledgers.</li>
              </ul>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 28px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">
              &copy; 2026 Qualiva Enterprise. High-Stakes Learning & Governance.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
  return sendEmail({ to: toEmail, subject, html, text });
}

export async function sendPasswordResetEmail(toEmail, tempPassword, userName = 'Enterprise Member') {
  const subject = `Qualiva Security: Temporary Credentials`;
  const text = `Hello ${userName},\n\nYour temporary password is: ${tempPassword}\n\nPlease sign in and set a permanent password.\n\nQualiva Enterprise Platform`;
  
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Temporary Credentials</title>
    </head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 28px; text-align: center;">
            <h2 style="margin: 0 0 14px 0; color: #0f172a;">Qualiva Security</h2>
            <p style="margin: 0 0 14px 0; font-size: 14px; color: #475569;">Hello <strong>${userName}</strong>, an administrator has reset your password.</p>
            <div style="background-color: #f1f5f9; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 18px; font-weight: bold; color: #0f172a; margin: 18px 0;">
              ${tempPassword}
            </div>
            <p style="font-size: 12px; color: #64748b;">Please sign in and set a permanent password.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
  return sendEmail({ to: toEmail, subject, html, text });
}
