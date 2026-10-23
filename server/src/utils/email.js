import nodemailer from 'nodemailer';
import { logger } from './logger.js';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    let host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
    let port = parseInt(process.env.SMTP_PORT, 10) || 587;
    let user = process.env.SMTP_USER;
    let pass = process.env.SMTP_PASS;

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
      logger.info(`Live Email Transporter initialized with Brevo Relay: ${host}:${port} (User: ${user})`);
    } else {
      if (process.env.NODE_ENV === 'production') {
        logger.warn('SMTP credentials not configured in production environment. Live email dispatch is disabled.');
      } else {
        logger.info('SMTP credentials not configured. Development simulated email mode active.');
      }
    }
  }
  return transporter;
}

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendEmail({ to, subject, html, text }) {
  try {
    const mailer = getTransporter();
    const smtpUser = process.env.SMTP_USER || 'noreply@qualiva.local';
    const rawFrom = process.env.SMTP_FROM || smtpUser;
    const fromAddress = rawFrom.includes('<')
      ? rawFrom
      : `"Qualiva Security" <${rawFrom}>`;

    if (!mailer) {
      if (process.env.NODE_ENV === 'production') {
        logger.warn(`[EMAIL NOT CONFIGURED] Message delivery skipped for: ${to} | Subject: ${subject}`);
        return {
          success: false,
          delivered: false,
          simulated: false,
          error: 'EMAIL_NOT_CONFIGURED',
          message: 'Email service is not configured on this server.',
        };
      }

      logger.info(`[SIMULATED EMAIL DISPATCH - DEV ONLY] To: ${to} | Subject: ${subject}`);
      return {
        success: false,
        delivered: false,
        simulated: true,
        error: 'EMAIL_SIMULATED_DEV_ONLY',
        message: 'Email delivery was simulated in development mode (SMTP credentials not configured).',
      };
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
    return {
      success: true,
      delivered: true,
      simulated: false,
      messageId: info.messageId,
      message: 'Email successfully delivered.',
    };
  } catch (error) {
    logger.error(`Failed to dispatch email to ${to}: ${error.message}`);
    return {
      success: false,
      delivered: false,
      simulated: false,
      error: error.message,
      message: 'Failed to deliver email through SMTP transport.',
    };
  }
}

export async function sendOtpEmail(toEmail, otpCode, userName = 'Qualiva Member', context = 'Sign In') {
  const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const subject = `[Qualiva Code: ${otpCode}] Your Verification Passcode (${timeString})`;
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`🔑 [DEV 2FA OTP] Passcode for ${toEmail}: ${otpCode}`);
  }
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

export async function sendUserProvisionedEmail(toEmail, tempPassword, userName = 'Enterprise Member', role = 'Student') {
  const roleName = String(role).replace(/_/g, ' ');
  const subject = `Welcome to Qualiva: Your Account Credentials`;
  const text = `Hello ${userName},\n\nYour Qualiva Enterprise account has been provisioned with ${roleName} access.\n\nYour login email: ${toEmail}\nYour temporary password: ${tempPassword}\n\nPlease sign in and set a permanent password.\n\nQualiva Enterprise Platform`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Account Provisioned</title>
    </head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
        <tr>
          <td style="padding: 28px 28px 16px 28px; text-align: center; border-bottom: 1px solid #f1f5f9;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">Qualiva</h1>
            <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 600; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px;">Account Provisioned</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px;">
            <p style="margin: 0 0 14px 0; font-size: 15px; color: #1e293b;">Hello <strong>${userName}</strong>,</p>
            <p style="margin: 0 0 18px 0; font-size: 14px; color: #475569; line-height: 1.6;">
              An administrator has provisioned your Qualiva account with <strong>${roleName}</strong> access. You can now sign in using the credentials below:
            </p>
            
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b;">Login Email: <strong style="color: #0f172a;">${toEmail}</strong></p>
              <p style="margin: 0; font-size: 13px; color: #64748b;">Temporary Password:</p>
              <div style="margin-top: 6px; font-family: monospace; font-size: 20px; font-weight: 700; color: #0284c7; letter-spacing: 1px;">
                ${tempPassword}
              </div>
            </div>

            <p style="margin: 20px 0 0 0; font-size: 13px; color: #475569; line-height: 1.5;">
              For security, you will be prompted to choose a new permanent password when you sign in for the first time.
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

export async function sendAccountDeletedEmail(toEmail, userName = 'Enterprise Member') {
  const subject = `Notice: Your Qualiva Enterprise Account has been Removed`;
  const text = `Hello ${userName},\n\nThis notification is to inform you that your Qualiva Enterprise account associated with ${toEmail} has been permanently removed by an administrator. All active sessions, course enrollments, and platform privileges have been terminated.\n\nIf you believe this was done in error, please contact your organization administrator.\n\nQualiva Enterprise Platform`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Account Removed</title>
    </head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 24px 28px; background-color: #0f172a; text-align: left;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">
              Qualiva Enterprise
            </h2>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px; text-align: left;">
            <h3 style="margin: 0 0 14px 0; font-size: 16px; color: #0f172a;">Account Removed</h3>
            <p style="margin: 0 0 16px 0; font-size: 14px; color: #475569; line-height: 1.6;">
              Hello <strong>${userName}</strong>,
            </p>
            <p style="margin: 0 0 16px 0; font-size: 14px; color: #475569; line-height: 1.6;">
              This notification is to inform you that your account associated with <strong>${toEmail}</strong> has been removed from the platform by an administrator.
            </p>
            <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 14px; margin: 20px 0;">
              <p style="margin: 0; font-size: 13px; color: #991b1b; line-height: 1.5;">
                All active sessions, course enrollments, assessment records, and platform access privileges have been terminated.
              </p>
            </div>
            <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
              If you have any questions or believe this was done in error, please reach out to your organizational training administrator.
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

