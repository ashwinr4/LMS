import nodemailer from 'nodemailer';
import { logger } from './logger.js';

let transporter = null;

/**
 * Mask an email address for safe logging without exposing PII
 * @param {string} email
 * @returns {string}
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '***';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length <= 2 ? name[0] + '*' : name.slice(0, 2) + '*'.repeat(Math.max(1, name.length - 2));
  return `${maskedName}@${domain}`;
}

/**
 * Classify SMTP and Nodemailer errors into actionable diagnostic categories
 * @param {Error|object} error
 * @returns {{ code: string, description: string, details: string }}
 */
export function classifySmtpError(error) {
  if (!error) return { code: 'UNKNOWN_ERROR', description: 'Unknown email dispatch error.', details: '' };

  const msg = (error.message || '').toLowerCase();
  const response = (error.response || '').toLowerCase();
  const errCode = (error.code || '').toUpperCase();
  const responseCode = Number(error.responseCode);

  // 1. Authentication Failure
  if (
    errCode === 'EAUTH' ||
    responseCode === 535 ||
    msg.includes('authentication failed') ||
    msg.includes('invalid login') ||
    msg.includes('bad credentials')
  ) {
    return {
      code: 'SMTP_AUTH_FAILED',
      description: 'SMTP authentication failed. Verify SMTP_USER and SMTP_PASS credentials in environment settings.',
      details: error.message,
    };
  }

  // 2. Sender Rejected / Unverified (Brevo 550 / 5.7.1 / sender not verified)
  if (
    responseCode === 550 ||
    responseCode === 553 ||
    msg.includes('sender address rejected') ||
    response.includes('sender address rejected') ||
    msg.includes('sender not validated') ||
    response.includes('sender not validated') ||
    msg.includes('not verified') ||
    response.includes('not verified') ||
    response.includes('5.7.1') ||
    response.includes('5.7.26') ||
    response.includes('5.7.27')
  ) {
    return {
      code: 'SMTP_SENDER_REJECTED',
      description: 'Sender address rejected by SMTP provider. Ensure SMTP_FROM is verified in your provider dashboard (e.g. Brevo Senders console).',
      details: error.message,
    };
  }

  // 3. Network Connection / Timeout Failure
  if (
    errCode === 'ETIMEDOUT' ||
    errCode === 'ECONNREFUSED' ||
    errCode === 'ESOCKET' ||
    errCode === 'ECONNRESET' ||
    errCode === 'ENOTFOUND' ||
    msg.includes('timeout') ||
    msg.includes('greeting never received')
  ) {
    return {
      code: 'SMTP_CONNECTION_FAILED',
      description: 'Could not connect to SMTP server. Note: Render Free Tier strictly blocks outbound SMTP ports (25, 465, 587). To resolve on Render Free Tier: set BREVO_API_KEY (operates over Port 443 HTTPS) or try SMTP_PORT=2525.',
      details: error.message,
    };
  }

  // 4. Rate Limiting / Provider Quota
  if (
    responseCode === 421 ||
    responseCode === 450 ||
    responseCode === 451 ||
    responseCode === 452 ||
    msg.includes('rate limit') ||
    msg.includes('quota exceeded') ||
    msg.includes('too many messages')
  ) {
    return {
      code: 'SMTP_RATE_LIMITED',
      description: 'SMTP sending quota or rate limit exceeded on provider account.',
      details: error.message,
    };
  }

  // 5. Recipient Rejected
  if (
    responseCode === 551 ||
    responseCode === 552 ||
    responseCode === 554 ||
    msg.includes('mailbox unavailable') ||
    msg.includes('recipient rejected')
  ) {
    return {
      code: 'SMTP_RECIPIENT_REJECTED',
      description: 'Recipient address rejected by mail server.',
      details: error.message,
    };
  }

  // 6. Generic Dispatch Error
  return {
    code: 'SMTP_DISPATCH_ERROR',
    description: 'Failed to deliver email through SMTP transport.',
    details: error.message,
  };
}

/**
 * Resolve sender address, ensuring technical usernames are not inadvertently used as From headers
 * @returns {string}
 */
export function getSenderAddress() {
  const smtpUser = process.env.SMTP_USER || '';
  const rawFrom = process.env.SMTP_FROM || '';

  if (rawFrom) {
    return rawFrom.includes('<') ? rawFrom : `"Qualiva Security" <${rawFrom}>`;
  }

  // If SMTP_FROM is not explicitly set, fallback to smtpUser only if it's not a technical Brevo relay user
  if (smtpUser && !smtpUser.endsWith('@smtp-brevo.com')) {
    return `"Qualiva Security" <${smtpUser}>`;
  }

  return `"Qualiva Security" <noreply@qualiva.local>`;
}

/**
 * Detect Brevo REST API Key (from BREVO_API_KEY or if pasted into SMTP_PASS with xkeysib- prefix)
 * @returns {string|null}
 */
export function getBrevoApiKey() {
  if (process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim()) {
    return process.env.BREVO_API_KEY.trim();
  }
  if (process.env.SMTP_PASS && process.env.SMTP_PASS.trim().startsWith('xkeysib-')) {
    return process.env.SMTP_PASS.trim();
  }
  return null;
}

/**
 * Send transactional email via Brevo's official REST API over HTTPS (Port 443)
 * Essential for cloud hosts like Render Free Tier that block outbound SMTP ports (25, 465, 587)
 */
export async function sendEmailViaBrevoApi({ to, subject, html, text }) {
  const apiKey = getBrevoApiKey();
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured.');
  }

  const fromAddress = getSenderAddress();
  const fromMatch = fromAddress.match(/^"?([^"<]+)"?\s*<([^>]+)>$/) || [null, 'Qualiva Security', fromAddress.replace(/[<>]/g, '').trim()];
  const senderName = fromMatch[1]?.trim() || 'Qualiva Security';
  const senderEmail = fromMatch[2]?.trim() || fromAddress.replace(/[<>]/g, '').trim();

  const plainText = text || html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: plainText,
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (response.ok && data.messageId) {
    logger.info(`Live Email Dispatched via Brevo HTTPS API (Port 443): MessageId=${data.messageId} to ${maskEmail(to)}`);
    return {
      success: true,
      delivered: true,
      simulated: false,
      messageId: data.messageId,
      message: 'Email successfully delivered via Brevo HTTPS API.',
    };
  }

  const errorMsg = data.message || `Brevo API returned HTTP status ${response.status}`;
  logger.error(`Brevo HTTPS API Error (${response.status}): ${errorMsg}`);
  return {
    success: false,
    delivered: false,
    simulated: false,
    error: data.code || `BREVO_API_${response.status}`,
    errorDetails: errorMsg,
    message: errorMsg,
  };
}

export function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (user && pass) {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
      const maskedUser = maskEmail(user);
      logger.info(`Live Email Transporter initialized with Brevo Relay: ${host}:${port} (User: ${maskedUser})`);
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

/**
 * Verify email connection and authentication handshake (HTTPS API or SMTP Relay)
 * @returns {Promise<{ configured: boolean, ready: boolean, provider?: string, host?: string, port?: number, error?: string, message?: string, details?: string }>}
 */
export async function verifySmtpConnection() {
  // 1. If Brevo HTTPS API key is available, test via HTTPS (Port 443)
  const apiKey = getBrevoApiKey();
  if (apiKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'accept': 'application/json', 'api-key': apiKey },
      });
      if (res.ok) {
        const acc = await res.json().catch(() => ({}));
        return {
          configured: true,
          ready: true,
          provider: 'BREVO_HTTPS_API',
          host: 'api.brevo.com:443 (HTTPS)',
          port: 443,
          email: acc.email,
        };
      }
      const err = await res.json().catch(() => ({}));
      return {
        configured: true,
        ready: false,
        provider: 'BREVO_HTTPS_API',
        error: 'BREVO_API_AUTH_FAILED',
        message: err.message || 'Invalid Brevo API key.',
      };
    } catch (netErr) {
      return {
        configured: true,
        ready: false,
        provider: 'BREVO_HTTPS_API',
        error: 'BREVO_API_NETWORK_ERROR',
        message: netErr.message,
      };
    }
  }

  // 2. Otherwise test SMTP Relay connection
  const mailer = getTransporter();
  if (!mailer) {
    return {
      configured: false,
      ready: false,
      error: 'EMAIL_NOT_CONFIGURED',
      message: 'Email credentials (BREVO_API_KEY or SMTP_USER/SMTP_PASS) are not configured in environment.',
    };
  }

  try {
    const success = await mailer.verify();
    return {
      configured: true,
      ready: Boolean(success),
      provider: 'SMTP_RELAY',
      host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
    };
  } catch (error) {
    const classified = classifySmtpError(error);
    return {
      configured: true,
      ready: false,
      provider: 'SMTP_RELAY',
      error: classified.code,
      message: classified.description,
      details: error.message,
    };
  }
}

export function isEmailConfigured() {
  return Boolean(getBrevoApiKey() || (process.env.SMTP_USER && process.env.SMTP_PASS));
}

export async function sendEmail({ to, subject, html, text }) {
  const maskedRecipient = maskEmail(to);

  // 1. If Brevo API Key is present, dispatch via HTTPS REST API (Port 443 - Bypasses Render Port Restrictions)
  if (getBrevoApiKey()) {
    try {
      return await sendEmailViaBrevoApi({ to, subject, html, text });
    } catch (apiError) {
      logger.error(`Brevo API Dispatch failed for ${maskedRecipient}: ${apiError.message}`);
      return {
        success: false,
        delivered: false,
        simulated: false,
        error: 'BREVO_API_ERROR',
        errorDetails: apiError.message,
        message: apiError.message,
      };
    }
  }

  // 2. Otherwise dispatch via SMTP Transporter (Nodemailer)
  try {
    const mailer = getTransporter();
    const fromAddress = getSenderAddress();

    if (!mailer) {
      if (process.env.NODE_ENV === 'production') {
        logger.warn(`[EMAIL NOT CONFIGURED] Message delivery skipped for: ${maskedRecipient} | Subject: ${subject}`);
        return {
          success: false,
          delivered: false,
          simulated: false,
          error: 'EMAIL_NOT_CONFIGURED',
          message: 'Email service is not configured on this server.',
        };
      }

      logger.info(`[SIMULATED EMAIL DISPATCH - DEV ONLY] To: ${maskedRecipient} | Subject: ${subject}`);
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

    logger.info(`Live Email Dispatched successfully: MessageId=${info.messageId} to ${maskedRecipient}`);
    return {
      success: true,
      delivered: true,
      simulated: false,
      messageId: info.messageId,
      message: 'Email successfully delivered.',
    };
  } catch (error) {
    const classified = classifySmtpError(error);
    logger.error(`Failed to dispatch email to ${maskedRecipient}: [${classified.code}] ${error.message}`);
    return {
      success: false,
      delivered: false,
      simulated: false,
      error: classified.code,
      errorDetails: error.message,
      message: classified.description,
    };
  }
}

export async function sendOtpEmail(toEmail, otpCode, userName = 'Qualiva Member', context = 'Sign In') {
  const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const subject = `[Qualiva Code: ${otpCode}] Your Verification Passcode (${timeString})`;
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`🔑 [DEV 2FA OTP] Passcode for ${maskEmail(toEmail)}: ${otpCode}`);
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

