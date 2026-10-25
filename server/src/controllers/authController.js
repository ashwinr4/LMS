import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { sendOtpEmail, sendWelcomeEmail } from '../utils/email.js';

function getAccessSecret() {
  return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
}

function getRefreshSecret() {
  return process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET;
}

const ACCESS_TOKEN_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_HOURS = parseInt(process.env.JWT_REFRESH_EXPIRES_HOURS || '12', 10);
const REFRESH_TOKEN_MAX_AGE_MS = REFRESH_TOKEN_EXPIRES_HOURS * 60 * 60 * 1000;

function getSessionExpiresAt() {
  return new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
}

function generateAccessToken(user) {
  const secret = getAccessSecret();
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not configured on the server.');
  }
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      name: user.name,
      department: user.department,
    },
    secret,
    { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_EXPIRES }
  );
}

function generateRefreshToken(user) {
  const secret = getRefreshSecret();
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not configured on the server.');
  }
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      jti: crypto.randomUUID(),
    },
    secret,
    { algorithm: 'HS256', expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || `${REFRESH_TOKEN_EXPIRES_HOURS}h` }
  );
}

function generateResetToken(user) {
  const secret = getAccessSecret();
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not configured on the server.');
  }
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      purpose: 'PASSWORD_RESET',
    },
    secret,
    { algorithm: 'HS256', expiresIn: '15m' }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function setRefreshTokenCookie(res, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('esmms_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

function clearRefreshTokenCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('esmms_refresh_token', {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  });
}

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  department: z.string().optional(),
  role: z.enum(['MODERATOR', 'COURSE_CREATOR', 'USER']).optional().default('USER'),
  otp: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// 1. User Registration with Mandatory OTP Verification
export async function register(req, res) {
  try {
    // Explicit security guard: Reject any attempt to self-assign ADMIN privileges
    if (req.body.role === 'ADMIN') {
      logger.warn(`Privilege escalation attempt blocked: Registration request for ${req.body.email || 'unknown'} attempted ADMIN role.`);
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_ROLE',
        message: 'Administrative accounts cannot be created via public registration. Please contact your system administrator.',
      });
    }

    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { name, email, password, department, role, otp } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const isModeratorRequest = role === 'MODERATOR';
    const isElevatedRoleRequest = role === 'MODERATOR' || role === 'COURSE_CREATOR';
    const targetStatus = isElevatedRoleRequest ? 'PENDING_APPROVAL' : 'ACTIVE';
    const initialRole = isElevatedRoleRequest ? 'USER' : (role || 'USER');

    // ── STAGE 1: INITIATE REGISTRATION & DISPATCH OTP ──
    if (!otp) {
      if (existingUser && existingUser.status !== 'PENDING_VERIFICATION') {
        return res.status(409).json({
          success: false,
          error: 'EMAIL_ALREADY_REGISTERED',
          message: 'An account with this email address already exists.',
        });
      }

      const generatedOtp = crypto.randomInt(100000, 999999).toString();
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      const passwordHash = await bcrypt.hash(password, 12);

      if (existingUser && existingUser.status === 'PENDING_VERIFICATION') {
        // Enforce 30-second cooldown on OTP regeneration
        if (existingUser.otpExpires) {
          const remainingMs = new Date(existingUser.otpExpires).getTime() - Date.now();
          const elapsedMs = 10 * 60 * 1000 - remainingMs;
          if (elapsedMs < 30000 && elapsedMs > 0) {
            return res.status(429).json({
              success: false,
              error: 'RATE_LIMIT_EXCEEDED',
              message: 'Please wait at least 30 seconds before requesting a new registration verification code.',
            });
          }
        }

        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name,
            passwordHash,
            department: department || 'General',
            role: initialRole,
            requestedRole: isElevatedRoleRequest ? role : null,
            otpCode: hashToken(generatedOtp),
            otpExpires,
          },
        });
      } else {
        await prisma.user.create({
          data: {
            name,
            email: normalizedEmail,
            passwordHash,
            department: department || 'General',
            role: initialRole,
            status: 'PENDING_VERIFICATION',
            requestedRole: isElevatedRoleRequest ? role : null,
            otpCode: hashToken(generatedOtp),
            otpExpires,
          },
        });
      }

      const emailResult = await sendOtpEmail(normalizedEmail, generatedOtp, name, 'Registration Verification');
      if (!emailResult.delivered) {
        if (emailResult.simulated) {
          logger.info(`Registration OTP simulated in dev for: ${normalizedEmail}`);
        } else {
          logger.error(`Registration OTP delivery failed for: ${normalizedEmail} [${emailResult.error}: ${emailResult.errorDetails || emailResult.message}]`);
          return res.status(503).json({
            success: false,
            error: 'EMAIL_DELIVERY_FAILED',
            message: 'Unable to deliver verification code. Please check email service configuration or try again later.',
          });
        }
      } else {
        logger.info(`Registration OTP dispatched for: ${normalizedEmail}`);
      }

      return res.status(200).json({
        success: true,
        requiresOtp: true,
        simulated: Boolean(emailResult.simulated),
        email: normalizedEmail,
        message: emailResult.simulated
          ? 'Verification code generated (simulated in development mode; see server console).'
          : 'A 6-digit verification code has been dispatched to your email address.',
      });
    }

    // ── STAGE 2: COMPLETE REGISTRATION VIA OTP VERIFICATION ──
    const cleanOtp = String(otp).trim();

    if (!existingUser || !existingUser.otpCode || !existingUser.otpExpires) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_OTP_REQUEST',
        message: 'No pending registration found for this email address. Please initiate registration first.',
      });
    }

    if (existingUser.status !== 'PENDING_VERIFICATION') {
      return res.status(409).json({
        success: false,
        error: 'EMAIL_ALREADY_REGISTERED',
        message: 'This account has already completed verification. Please sign in.',
      });
    }

    if (new Date() > new Date(existingUser.otpExpires)) {
      return res.status(400).json({
        success: false,
        error: 'OTP_EXPIRED',
        message: 'Verification code has expired. Please request a new code.',
      });
    }

    const providedHash = hashToken(cleanOtp);
    if (providedHash !== existingUser.otpCode) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_OTP_CODE',
        message: 'Incorrect verification code. Please check and try again.',
      });
    }

    // OTP Verified: Invalidate OTP (single-use) and transition account to active/pending status
    const verifiedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        status: targetStatus,
        otpCode: null,
        otpExpires: null,
        lastActive: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        department: true,
        avatar: true,
        requestedRole: true,
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: verifiedUser.id,
        actorEmail: verifiedUser.email,
        actorName: verifiedUser.name,
        action: 'USER_REGISTERED_OTP_VERIFIED',
        resource: 'USER',
        details: isElevatedRoleRequest
          ? `User verified email OTP and requested ${role} privileges. Awaiting Administrator approval.`
          : `User verified email OTP and registered with role ${verifiedUser.role}`,
        ipAddress: req.ip,
        riskLevel: isElevatedRoleRequest ? 'MEDIUM' : 'LOW',
      },
    });

    if (isModeratorRequest) {
      try {
        await prisma.notification.create({
          data: {
            targetRole: 'ADMIN',
            title: '🛡️ Moderator Role Request',
            message: `${verifiedUser.name} (${verifiedUser.email}) verified their email and requested Moderator privileges. Administrator verification and permission setup is required.`,
            type: 'SYSTEM',
            link: '/admin/approvals?tab=moderators',
          },
        });
        if (io) {
          io.to('role_ADMIN').emit('system_notification', {
            title: '🛡️ Moderator Role Request',
            message: `${verifiedUser.name} requested Moderator access.`,
            type: 'SYSTEM',
            link: '/admin/approvals?tab=moderators',
          });
          io.to('role_ADMIN').emit('admin_new_request', {
            requestType: 'MODERATOR_REGISTRATION',
            type: 'MODERATOR_REGISTRATION',
            title: 'Moderator Request',
            user: verifiedUser,
            userId: verifiedUser.id,
            message: `${verifiedUser.name} requested Moderator access.`,
          });
        }
      } catch (notifErr) {
        logger.warn(`Moderator request notification error: ${notifErr.message}`);
      }

      return res.status(201).json({
        success: true,
        pendingApproval: true,
        message: 'Your email has been verified and your account registered. Moderator privileges require administrator verification before activation.',
        user: verifiedUser,
      });
    }

    sendWelcomeEmail(verifiedUser.email, verifiedUser.name, verifiedUser.role).then((res) => {
      if (!res.delivered && !res.simulated) {
        logger.warn(`Could not deliver welcome email to ${verifiedUser.email}: [${res.error}] ${res.errorDetails || res.message}`);
      }
    }).catch((welcomeErr) => {
      logger.warn(`Could not dispatch welcome email to ${verifiedUser.email}: ${welcomeErr.message}`);
    });

    const accessToken = generateAccessToken(verifiedUser);
    const refreshToken = generateRefreshToken(verifiedUser);
    const refreshTokenHash = hashToken(refreshToken);

    const expiresAt = getSessionExpiresAt();

    await prisma.activeSession.create({
      data: {
        userId: verifiedUser.id,
        refreshTokenHash,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'Unknown',
        expiresAt,
      },
    });

    setRefreshTokenCookie(res, refreshToken);

    logger.info(`User Registered & Verified successfully: ${verifiedUser.email} (${verifiedUser.role})`);

    return res.status(201).json({
      success: true,
      message: 'Account verified and created successfully.',
      user: verifiedUser,
      accessToken,
    });
  } catch (error) {
    logger.error(`Registration Error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'REGISTRATION_FAILED',
      message: 'Failed to create account. Please try again.',
    });
  }
}

// 2. User Login with Brute-Force Lockout (Direct Login without OTP)
export async function login(req, res) {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User does not exist. Please check your email or create a new account.',
      });
    }

    // Check account lockout
    if (user.status === 'LOCKED' && user.lockUntil) {
      const now = new Date();
      if (new Date(user.lockUntil) > now) {
        const remainingMinutes = Math.ceil((new Date(user.lockUntil).getTime() - now.getTime()) / 60000);
        return res.status(423).json({
          success: false,
          error: 'ACCOUNT_LOCKED',
          message: `Account is locked due to multiple failed login attempts. Try again in ${remainingMinutes} minute(s).`,
        });
      } else {
        // Lockout expired, restore active status
        await prisma.user.update({
          where: { id: user.id },
          data: { status: 'ACTIVE', failedLoginAttempts: 0, lockUntil: null },
        });
        user.status = 'ACTIVE';
        user.failedLoginAttempts = 0;
      }
    }

    if (user.status === 'PENDING_VERIFICATION') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_UNVERIFIED',
        message: 'Your account email has not been verified. Please complete verification using the code dispatched to your email.',
      });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Please contact an administrator.',
      });
    }

    if (user.status === 'PENDING_APPROVAL') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_PENDING_APPROVAL',
        message: 'Your account is pending administrator verification and operational permission provisioning. You will be notified once active.',
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      const attempts = user.failedLoginAttempts + 1;
      const willLock = attempts >= 5;
      const lockUntil = willLock ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          status: willLock ? 'LOCKED' : user.status,
          lockUntil,
        },
      });

      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          actorEmail: user.email,
          actorName: user.name,
          action: 'LOGIN_FAILED',
          resource: 'AUTH',
          details: `Failed password attempt ${attempts}/5${willLock ? ' (ACCOUNT LOCKED)' : ''}`,
          ipAddress: req.ip,
          riskLevel: willLock ? 'HIGH' : 'MEDIUM',
        },
      });

      if (willLock) {
        return res.status(423).json({
          success: false,
          error: 'ACCOUNT_LOCKED',
          message: 'Account locked for 15 minutes due to 5 consecutive failed login attempts.',
        });
      }

      if (user.mustChangePassword) {
        return res.status(401).json({
          success: false,
          error: 'TEMPORARY_PASSWORD_REQUIRED',
          isTemporaryPasswordNotice: true,
          message: 'An administrator has reset your credentials. A new temporary password was dispatched to your email address. Please check your inbox and use the temporary password to sign in.',
        });
      }

      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: `Invalid email or password. ${5 - attempts} attempt(s) remaining before account lockout.`,
      });
    }

    // Password Valid: Reset failed login attempts and lockout timestamps
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockUntil: null,
        lastActive: new Date(),
      },
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    const refreshTokenHash = hashToken(refreshToken);

    const expiresAt = getSessionExpiresAt();

    await prisma.activeSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || 'Direct Login Session',
        expiresAt,
      },
    });

    setRefreshTokenCookie(res, refreshToken);

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorEmail: user.email,
        actorName: user.name,
        action: 'USER_LOGIN_SUCCESS',
        resource: 'AUTH',
        details: 'User authenticated successfully via email and password.',
        ipAddress: req.ip || '127.0.0.1',
        riskLevel: 'LOW',
      },
    });

    let parsedPerms = null;
    if (user.moderatorPermissions) {
      try {
        parsedPerms = typeof user.moderatorPermissions === 'string'
          ? JSON.parse(user.moderatorPermissions)
          : user.moderatorPermissions;
      } catch {
        parsedPerms = null;
      }
    }

    logger.info(`User logged in directly without OTP: ${user.email} (${user.role})`);

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        department: user.department,
        avatar: user.avatar,
        mustChangePassword: Boolean(user.mustChangePassword),
        requestedRole: user.requestedRole,
        moderatorPermissions: parsedPerms,
      },
      accessToken,
    });
  } catch (error) {
    logger.error(`Login Controller Error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'LOGIN_FAILED',
      message: error.message || 'Authentication failed. Please try again.',
    });
  }
}

// 3. 1-Click Demo Login Helper
export async function demoLogin(req, res) {
  try {
    const { role } = req.body;
    let targetEmail = 'david.kim@qualiva.io';

    if (role === 'admin' || role === 'ADMIN') {
      targetEmail = 'sarah.chen@qualiva.io';
    } else if (role === 'creator' || role === 'COURSE_CREATOR') {
      targetEmail = 'james.mitchell@qualiva.io';
    } else if (role === 'moderator' || role === 'MODERATOR') {
      targetEmail = 'marcus.johnson@qualiva.io';
    } else {
      targetEmail = 'david.kim@qualiva.io';
    }

    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'DEMO_USER_NOT_FOUND',
        message: `Demo user for role ${role} not found. Please run seed script.`,
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    const refreshTokenHash = hashToken(refreshToken);

    const expiresAt = getSessionExpiresAt();

    await prisma.activeSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'Demo Client',
        expiresAt,
      },
    });

    setRefreshTokenCookie(res, refreshToken);

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      department: user.department,
      phone: user.phone,
      location: user.location,
      avatar: user.avatar,
      requestedRole: user.requestedRole,
      moderatorPermissions: user.moderatorPermissions
        ? typeof user.moderatorPermissions === 'string'
          ? JSON.parse(user.moderatorPermissions)
          : user.moderatorPermissions
        : user.role === 'MODERATOR'
        ? {
            courses: { view: true, manage: true },
            enrollments: { view: true, manage: true, approve: true },
            transfers: { view: true, approve: true },
            messages: { view: true, manage: true },
            auditLogs: { view: true },
          }
        : null,
    };

    logger.info(`Demo Login activated for: ${safeUser.email} (${safeUser.role})`);

    return res.status(200).json({
      success: true,
      message: `Signed in as Demo ${safeUser.role}`,
      user: safeUser,
      accessToken,
    });
  } catch (error) {
    logger.error(`Demo Login Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'DEMO_LOGIN_FAILED',
      message: 'Failed to authenticate demo account.',
    });
  }
}

// 4. Dual-Token Rotation
export async function refresh(req, res) {
  try {
    const rawRefreshToken = req.cookies?.esmms_refresh_token || req.body?.refreshToken;

    if (!rawRefreshToken) {
      return res.status(401).json({
        success: false,
        error: 'REFRESH_TOKEN_REQUIRED',
        message: 'No refresh token provided in cookies or request body.',
      });
    }

    const refreshSecret = getRefreshSecret();
    if (!refreshSecret) {
      logger.error('CRITICAL: JWT refresh secret is not configured.');
      return res.status(500).json({
        success: false,
        error: 'SERVER_CONFIGURATION_ERROR',
        message: 'Authentication service is misconfigured.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(rawRefreshToken, refreshSecret, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({
        success: false,
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token expired or invalid.',
      });
    }

    const incomingHash = hashToken(rawRefreshToken);

    const session = await prisma.activeSession.findUnique({
      where: { refreshTokenHash: incomingHash },
      include: { user: true },
    });

    if (!session || session.isRevoked || new Date(session.expiresAt) < new Date()) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        error: 'SESSION_EXPIRED_OR_REVOKED',
        message: 'Session has been revoked or expired. Please log in again.',
      });
    }

    // Ensure user record is loaded even if adapter include is shallow
    let user = session.user;
    if (!user && session.userId) {
      user = await prisma.user.findUnique({ where: { id: session.userId } });
    }

    if (!user) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'The account associated with this session no longer exists.',
      });
    }

    // Invalidate previous session token (One-Time Use Token Rotation)
    await prisma.activeSession.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    // Generate new token pair
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    const newRefreshTokenHash = hashToken(newRefreshToken);

    const newExpiresAt = getSessionExpiresAt();

    await prisma.activeSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: newRefreshTokenHash,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'Rotated Session',
        expiresAt: newExpiresAt,
      },
    });

    setRefreshTokenCookie(res, newRefreshToken);

    let parsedPerms = null;
    if (user.moderatorPermissions) {
      try {
        parsedPerms = typeof user.moderatorPermissions === 'string'
          ? JSON.parse(user.moderatorPermissions)
          : user.moderatorPermissions;
      } catch {
        parsedPerms = null;
      }
    }

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        department: user.department,
        phone: user.phone,
        location: user.location,
        avatar: user.avatar,
        mustChangePassword: Boolean(user.mustChangePassword),
        requestedRole: user.requestedRole,
        moderatorPermissions: parsedPerms,
      },
    });
  } catch (error) {
    logger.error(`Refresh Controller Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'REFRESH_FAILED',
      message: 'Failed to refresh authentication session.',
    });
  }
}

// 5. User Logout
export async function logout(req, res) {
  try {
    const rawRefreshToken = req.cookies?.esmms_refresh_token || req.body?.refreshToken;

    if (rawRefreshToken) {
      const incomingHash = hashToken(rawRefreshToken);
      await prisma.activeSession.updateMany({
        where: { refreshTokenHash: incomingHash },
        data: { isRevoked: true },
      });
    }

    if (req.user?.id) {
      await prisma.activeSession.updateMany({
        where: { userId: req.user.id },
        data: { isRevoked: true },
      });
    }

    clearRefreshTokenCookie(res);

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          actorEmail: req.user.email,
          actorName: req.user.name,
          action: 'USER_LOGOUT',
          resource: 'AUTH',
          details: 'User logged out and revoked active session.',
          ipAddress: req.ip,
          riskLevel: 'LOW',
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    logger.error(`Logout Controller Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'LOGOUT_FAILED',
      message: 'An error occurred during logout.',
    });
  }
}

// 6. Get Current User Profile (`/me`)
export async function getMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        department: true,
        phone: true,
        location: true,
        avatar: true,
        mustChangePassword: true,
        requestedRole: true,
        moderatorPermissions: true,
        lastActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User profile not found.',
      });
    }

    let parsedPerms = null;
    if (user.moderatorPermissions) {
      try {
        parsedPerms = typeof user.moderatorPermissions === 'string'
          ? JSON.parse(user.moderatorPermissions)
          : user.moderatorPermissions;
      } catch {
        parsedPerms = null;
      }
    }

    return res.status(200).json({
      success: true,
      user: {
        ...user,
        moderatorPermissions: parsedPerms,
      },
    });
  } catch (error) {
    logger.error(`GetMe Controller Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'PROFILE_FETCH_FAILED',
      message: 'Failed to fetch user profile.',
    });
  }
}

export async function updateProfile(req, res) {
  try {
    const { name, avatar } = req.body;
    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_NAME',
          message: 'Full Name must be at least 2 characters long.',
        });
      }
      updateData.name = name.trim();
    }

    if (avatar !== undefined) {
      updateData.avatar = typeof avatar === 'string' ? avatar.trim() : null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        department: true,
        phone: true,
        location: true,
        avatar: true,
        mustChangePassword: true,
        lastActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(`User ${req.user.email} updated profile: Name="${updatedUser.name}"`);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: updatedUser,
    });
  } catch (error) {
    logger.error(`Update Profile Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'PROFILE_UPDATE_FAILED',
      message: 'Failed to update user profile.',
    });
  }
}

// 7. Request OTP (Supports Registration & Password Reset with Anti-Enumeration & Rate Limiting)
export async function requestOtp(req, res) {
  try {
    const { email, purpose } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        error: 'EMAIL_REQUIRED',
        message: 'A valid email address is required.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    // Anti-enumeration: Return generic success if user does not exist
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account is associated with this email address, a verification code has been dispatched.',
      });
    }

    // Rate limiting: Require at least 30 seconds between OTP requests
    if (user.otpExpires) {
      const remainingMs = new Date(user.otpExpires).getTime() - Date.now();
      const elapsedMs = 10 * 60 * 1000 - remainingMs;
      if (elapsedMs < 30000 && elapsedMs > 0) {
        return res.status(429).json({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Please wait at least 30 seconds before requesting another verification code.',
        });
      }
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const isPasswordReset = purpose === 'PASSWORD_RESET' || user.status !== 'PENDING_VERIFICATION';

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: hashToken(otp),
        otpExpires,
        ...(isPasswordReset ? { passwordResetRequested: true, passwordResetRequestedAt: new Date() } : {}),
      },
    });

    const emailContext = user.status === 'PENDING_VERIFICATION' ? 'Account Verification' : 'Password Reset';
    const emailResult = await sendOtpEmail(user.email, otp, user.name, emailContext);
    if (!emailResult.delivered) {
      if (emailResult.simulated) {
        logger.info(`OTP delivery simulated in dev for: ${user.email} (Context: ${emailContext})`);
      } else {
        logger.error(`OTP delivery failed for: ${user.email} [${emailResult.error}: ${emailResult.errorDetails || emailResult.message}]`);
        return res.status(503).json({
          success: false,
          error: 'EMAIL_DELIVERY_FAILED',
          message: 'Unable to deliver verification code. Please check email service configuration or try again later.',
        });
      }
    } else {
      logger.info(`OTP generated and dispatched for ${user.email} (Context: ${emailContext})`);
    }

    return res.status(200).json({
      success: true,
      simulated: Boolean(emailResult.simulated),
      message: emailResult.simulated
        ? 'Verification code generated (simulated in development mode; see server console).'
        : 'A verification code has been dispatched to your email address.',
    });
  } catch (error) {
    logger.error(`Request OTP Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'OTP_DISPATCH_FAILED',
      message: 'Failed to dispatch verification code.',
    });
  }
}

// 8. Verify OTP (Registration Verification & Scoped Password Reset)
export async function verifyOtp(req, res) {
  try {
    const { email, otp } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanOtp = String(otp || '').trim();

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user || !user.otpCode || !user.otpExpires) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_OTP_REQUEST',
        message: 'No active OTP request found. Please request a fresh code.',
      });
    }

    if (new Date() > new Date(user.otpExpires)) {
      return res.status(400).json({
        success: false,
        error: 'OTP_EXPIRED',
        message: 'Verification code has expired. Please request a new code.',
      });
    }

    const providedHash = hashToken(cleanOtp);
    if (providedHash !== user.otpCode) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_OTP_CODE',
        message: 'Incorrect verification code. Please check and try again.',
      });
    }

    // Clear used OTP immediately for strict single-use
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: null,
        otpExpires: null,
        lastActive: new Date(),
      },
    });

    // Case 1: Account Registration Verification
    if (user.status === 'PENDING_VERIFICATION') {
      const isElevated = user.requestedRole === 'MODERATOR' || user.requestedRole === 'COURSE_CREATOR';
      const targetStatus = isElevated ? 'PENDING_APPROVAL' : 'ACTIVE';

      const verifiedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          status: targetStatus,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          department: true,
          avatar: true,
          requestedRole: true,
          createdAt: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          actorId: verifiedUser.id,
          actorEmail: verifiedUser.email,
          actorName: verifiedUser.name,
          action: 'USER_REGISTERED_OTP_VERIFIED',
          resource: 'USER',
          details: `User verified email OTP and activated account with role ${verifiedUser.role} (status: ${verifiedUser.status})`,
          ipAddress: req.ip || '127.0.0.1',
          riskLevel: isElevated ? 'MEDIUM' : 'LOW',
        },
      });

      if (isElevated && verifiedUser.requestedRole === 'MODERATOR') {
        return res.status(201).json({
          success: true,
          pendingApproval: true,
          message: 'Your email has been verified. Moderator privileges require administrator verification before activation.',
          user: verifiedUser,
        });
      }

      sendWelcomeEmail(verifiedUser.email, verifiedUser.name, verifiedUser.role).then((res) => {
        if (!res.delivered && !res.simulated) {
          logger.warn(`Could not deliver welcome email to ${verifiedUser.email}: [${res.error}] ${res.errorDetails || res.message}`);
        }
      }).catch((welcomeErr) => {
        logger.warn(`Could not dispatch welcome email to ${verifiedUser.email}: ${welcomeErr.message}`);
      });

      const accessToken = generateAccessToken(verifiedUser);
      const refreshToken = generateRefreshToken(verifiedUser);
      const refreshTokenHash = hashToken(refreshToken);

      const expiresAt = getSessionExpiresAt();

      await prisma.activeSession.create({
        data: {
          userId: verifiedUser.id,
          refreshTokenHash,
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.headers['user-agent'] || 'Registration Session',
          expiresAt,
        },
      });

      setRefreshTokenCookie(res, refreshToken);

      return res.status(200).json({
        success: true,
        message: 'Account verified successfully.',
        user: verifiedUser,
        accessToken,
      });
    }

    // Case 2: Password Recovery / Reset OTP Verification
    // Issue scoped reset token only — do NOT issue a general login session
    const resetToken = generateResetToken(user);

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorEmail: user.email,
        actorName: user.name,
        action: 'PASSWORD_RESET_OTP_VERIFIED',
        resource: 'AUTH',
        details: 'User successfully verified password reset OTP. Scoped reset token issued.',
        ipAddress: req.ip || '127.0.0.1',
        riskLevel: 'MEDIUM',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Verification successful. You may now reset your password.',
      resetToken,
      email: user.email,
    });
  } catch (error) {
    logger.error(`Verify OTP Error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'OTP_VERIFICATION_FAILED',
      message: error.message || 'Failed to verify code.',
    });
  }
}

// 9. Google Single Sign-On (SSO) Controller (Direct Authentication & Provisioning without Additional OTP)
export async function googleLogin(req, res) {
  try {
    const { credential, role, department } = req.body;

    if (!credential || typeof credential !== 'string' || !credential.trim()) {
      return res.status(400).json({
        success: false,
        error: 'CREDENTIAL_REQUIRED',
        message: 'A valid Google ID token credential is required for Google authentication.',
      });
    }

    const trimmedCredential = credential.trim();
    let email = null;
    let name = null;
    let avatar = null;

    try {
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(trimmedCredential)}`
      );

      if (!verifyRes.ok) {
        logger.warn(`Google tokeninfo verification failed with status: ${verifyRes.status}`);
        return res.status(401).json({
          success: false,
          error: 'INVALID_GOOGLE_CREDENTIAL',
          message: 'Google ID token verification failed or token has expired.',
        });
      }

      const payload = await verifyRes.json();

      // Validate Issuer
      const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
      if (!payload.iss || !validIssuers.includes(payload.iss)) {
        logger.warn(`Google SSO token rejected: invalid issuer (${payload.iss})`);
        return res.status(401).json({
          success: false,
          error: 'INVALID_ISSUER',
          message: 'Google authentication failed: token issuer is untrusted.',
        });
      }

      // Validate Audience (Client ID)
      const expectedClientId = process.env.GOOGLE_CLIENT_ID;
      if (expectedClientId && payload.aud !== expectedClientId) {
        logger.warn(`Google SSO token audience mismatch: expected ${expectedClientId}, got ${payload.aud}`);
        return res.status(401).json({
          success: false,
          error: 'AUDIENCE_MISMATCH',
          message: 'Google authentication failed: credential audience does not match configured client.',
        });
      }

      // Validate Expiry
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp && Number(payload.exp) < nowSec) {
        logger.warn(`Google SSO token expired at ${payload.exp}`);
        return res.status(401).json({
          success: false,
          error: 'TOKEN_EXPIRED',
          message: 'Google ID token has expired. Please sign in again.',
        });
      }

      // Validate Email Verification Claim
      const isEmailVerified = payload.email_verified === 'true' || payload.email_verified === true;
      if (!isEmailVerified) {
        logger.warn(`Google SSO login rejected: email ${payload.email} is not verified by Google.`);
        return res.status(403).json({
          success: false,
          error: 'EMAIL_NOT_VERIFIED',
          message: 'Your Google email address is unverified. Please verify your email with Google first.',
        });
      }

      if (!payload.email) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_GOOGLE_CREDENTIAL',
          message: 'Google token does not contain an email claim.',
        });
      }

      email = payload.email.toLowerCase();
      name = payload.name || payload.given_name || 'Google Member';
      avatar = payload.picture || null;
    } catch (netErr) {
      logger.error(`Network error during Google tokeninfo verification: ${netErr.message}`);
      return res.status(502).json({
        success: false,
        error: 'GOOGLE_VERIFICATION_UNAVAILABLE',
        message: 'Could not contact Google authentication servers. Please try again.',
      });
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    // ── STAGE 1 & 2: NEW USER ONBOARDING (Direct Creation without OTP) ──
    if (!user) {
      const normalizedRole = typeof role === 'string' ? role.trim().toUpperCase() : undefined;
      const ALLOWED_ONBOARDING_ROLES = ['USER', 'MODERATOR', 'COURSE_CREATOR'];

      // Security guard: Prevent self-assignment of ADMIN via Google onboarding
      if (normalizedRole === 'ADMIN') {
        logger.warn(`Privilege escalation attempt blocked in Google SSO onboarding for ${email}`);
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_ROLE',
          message: 'Administrative accounts cannot be provisioned via public onboarding.',
        });
      }

      if (normalizedRole && !ALLOWED_ONBOARDING_ROLES.includes(normalizedRole)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ROLE',
          message: `Invalid role requested. Allowed roles are: ${ALLOWED_ONBOARDING_ROLES.join(', ')}`,
        });
      }

      // Step A: Prompt user to choose their target role
      if (!normalizedRole) {
        return res.status(200).json({
          success: true,
          requiresOnboarding: true,
          googleProfile: {
            email,
            name: name || email.split('@')[0],
            avatar,
          },
          message: 'Please choose your target role to complete account setup.',
        });
      }

      // Step B: Role provided -> Provision immediately without secondary OTP
      const isElevated = normalizedRole === 'MODERATOR' || normalizedRole === 'COURSE_CREATOR';
      const initialStatus = isElevated ? 'PENDING_APPROVAL' : 'ACTIVE';
      const initialRole = isElevated ? 'USER' : normalizedRole;

      const dummyPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          passwordHash: dummyPassword,
          role: initialRole,
          status: initialStatus,
          requestedRole: isElevated ? normalizedRole : null,
          department: department || 'General',
          avatar,
        },
      });

      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          actorEmail: user.email,
          actorName: user.name,
          action: 'USER_REGISTERED_GOOGLE_SSO',
          resource: 'AUTH',
          details: `User provisioned via Google SSO with role ${user.role} (status: ${user.status}) without additional OTP`,
          ipAddress: req.ip,
          riskLevel: isElevated ? 'MEDIUM' : 'LOW',
        },
      });

      if (isElevated && normalizedRole === 'MODERATOR') {
        try {
          await prisma.notification.create({
            data: {
              targetRole: 'ADMIN',
              title: '🛡️ Moderator Role Request (Google SSO)',
              message: `${user.name} (${user.email}) onboarded via Google SSO requesting Moderator privileges. Administrator verification required.`,
              type: 'SYSTEM',
              link: '/admin/approvals?tab=moderators',
            },
          });
        } catch (notifErr) {
          logger.warn(`Moderator Google onboarding notification error: ${notifErr.message}`);
        }

        return res.status(201).json({
          success: true,
          pendingApproval: true,
          message: 'Your account has been registered via Google SSO. Moderator privileges require administrator verification before activation.',
          user,
        });
      }

      logger.info(`New user provisioned via Google SSO: ${user.email} (${user.role})`);
    } else {
      // ── EXISTING USER LOGIN ──
      if (user.status === 'LOCKED' || user.status === 'SUSPENDED') {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_LOCKED',
          message: `Your account status is ${user.status}. Please contact your administrator.`,
        });
      }

      if (user.status === 'PENDING_APPROVAL') {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_PENDING_APPROVAL',
          message: 'Your account is pending administrator verification and operational permission provisioning. You will be notified once active.',
        });
      }

      if (user.status === 'PENDING_VERIFICATION') {
        // Since Google has cryptographically verified their email, activate their account
        user = await prisma.user.update({
          where: { id: user.id },
          data: { status: 'ACTIVE', otpCode: null, otpExpires: null },
        });
      }

      if (avatar && !user.avatar) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatar },
        });
      }
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    const refreshTokenHash = hashToken(refreshToken);

    const expiresAt = getSessionExpiresAt();

    await prisma.activeSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'Google SSO Session',
        expiresAt,
      },
    });

    setRefreshTokenCookie(res, refreshToken);

    logger.info(`User signed in via Google SSO: ${user.email} (${user.role})`);

    let parsedGooglePerms = null;
    if (user.moderatorPermissions) {
      try {
        parsedGooglePerms = typeof user.moderatorPermissions === 'string'
          ? JSON.parse(user.moderatorPermissions)
          : user.moderatorPermissions;
      } catch {
        parsedGooglePerms = null;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Authenticated successfully via Google SSO.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        department: user.department,
        phone: user.phone,
        location: user.location,
        avatar: user.avatar,
        mustChangePassword: Boolean(user.mustChangePassword),
        requestedRole: user.requestedRole,
        moderatorPermissions: parsedGooglePerms,
      },
      accessToken,
    });
  } catch (error) {
    logger.error(`Google SSO Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'GOOGLE_AUTH_FAILED',
      message: 'Failed to complete Google authentication.',
    });
  }
}

/**
 * POST /api/v1/auth/request-password-reset
 * Public: User requests password reset, notifying Administrators in real-time
 */
export async function requestPasswordReset(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Respond generic success to prevent email enumeration
      return res.status(200).json({
        success: true,
        message: 'If an active enterprise account is associated with this email, a reset request has been routed to the Administrator.',
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetRequested: true,
        passwordResetRequestedAt: new Date(),
      },
    });

    // Create persistent notification for Admins
    try {
      await prisma.notification.create({
        data: {
          targetRole: 'ADMIN',
          title: '🔑 Password Reset Requested',
          message: `${user.name} (${user.department || 'Enterprise Member'}) requested a credential reset.`,
          type: 'PASSWORD_RESET',
          link: '/admin/users',
          metadata: JSON.stringify({ userId: user.id, email: user.email }),
        },
      });

      const io = req.app?.get('io');
      if (io) {
        io.to('role_ADMIN').emit('system_notification', {
          title: '🔑 Password Reset Requested',
          message: `${user.name} (${user.email}) requested a credential reset.`,
          type: 'PASSWORD_RESET',
          link: '/admin/users',
        });
        io.to('role_ADMIN').emit('password_reset_requested', {
          userId: user.id,
          name: user.name,
          email: user.email,
          department: user.department,
        });
      }
    } catch (notifErr) {
      logger.warn(`Failed to create password reset notification: ${notifErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Password reset request submitted successfully. An administrator has been notified.',
    });
  } catch (error) {
    logger.error(`Request Password Reset Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to process reset request.' });
  }
}

/**
 * POST /api/v1/auth/change-password
 * Authenticated user sets new permanent password, clearing mustChangePassword flag
 */
export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    // Require current password for standard password changes
    if (!user.mustChangePassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          error: 'CURRENT_PASSWORD_REQUIRED',
          message: 'Current password is required to establish a new password.',
        });
      }
      const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Current password does not match existing credentials.',
        });
      }
    } else if (currentPassword) {
      const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Current password does not match existing credentials.',
        });
      }
    }

    // Enforce established password policy (minimum 8 characters)
    if (!newPassword || newPassword.trim().length < 8) {
      return res.status(400).json({
        success: false,
        error: 'PASSWORD_TOO_SHORT',
        message: 'New password must be at least 8 characters long.',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 12);
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        department: true,
        avatar: true,
        mustChangePassword: true,
      },
    });

    // Revoke applicable active sessions across other devices
    try {
      const currentRefreshToken = req.cookies?.esmms_refresh_token;
      const currentHash = currentRefreshToken ? hashToken(currentRefreshToken) : null;
      await prisma.activeSession.updateMany({
        where: {
          userId: req.user.id,
          isRevoked: false,
          ...(currentHash ? { refreshTokenHash: { not: currentHash } } : {}),
        },
        data: { isRevoked: true },
      });
    } catch (sessionErr) {
      logger.warn(`Could not revoke prior active sessions on password change: ${sessionErr.message}`);
    }

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorName: req.user.name,
        action: 'USER_PASSWORD_CHANGED',
        resource: 'AUTH',
        details: 'User established permanent credentials and prior sessions were revoked.',
        ipAddress: req.ip || '127.0.0.1',
        riskLevel: 'MEDIUM',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Your permanent password has been established successfully.',
      user: updated,
    });
  } catch (error) {
    logger.error(`Change Password Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to establish new password.' });
  }
}

/**
 * POST /api/v1/auth/reset-password
 * Complete password reset using scoped resetToken obtained via verifyOtp
 */
export async function resetPasswordWithOtp(req, res) {
  try {
    const { email, resetToken, newPassword } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const token = String(resetToken || '').trim();
    const password = String(newPassword || '');

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'RESET_TOKEN_REQUIRED',
        message: 'A valid password reset token is required.',
      });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'PASSWORD_TOO_SHORT',
        message: 'New password must be at least 8 characters long.',
      });
    }

    const secret = getAccessSecret();
    let decoded;
    try {
      decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({
        success: false,
        error: 'INVALID_OR_EXPIRED_RESET_TOKEN',
        message: 'Password reset token has expired or is invalid. Please request a new verification code.',
      });
    }

    if (decoded.purpose !== 'PASSWORD_RESET') {
      return res.status(403).json({
        success: false,
        error: 'INVALID_TOKEN_PURPOSE',
        message: 'Provided token cannot be used for password recovery.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
    });

    if (!user || (cleanEmail && user.email.toLowerCase() !== cleanEmail)) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User account associated with this reset token was not found.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordResetRequested: false,
        passwordResetRequestedAt: null,
        failedLoginAttempts: 0,
        lockUntil: null,
        otpCode: null,
        otpExpires: null,
      },
    });

    // Revoke all active sessions for this user across all devices
    try {
      await prisma.activeSession.updateMany({
        where: { userId: user.id, isRevoked: false },
        data: { isRevoked: true },
      });
    } catch (sessionErr) {
      logger.warn(`Could not revoke prior active sessions on reset-password: ${sessionErr.message}`);
    }

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorEmail: user.email,
        actorName: user.name,
        action: 'USER_PASSWORD_RESET_COMPLETED',
        resource: 'AUTH',
        details: 'User successfully completed OTP-verified password reset. All prior active sessions were revoked.',
        ipAddress: req.ip || '127.0.0.1',
        riskLevel: 'MEDIUM',
      },
    });

    logger.info(`Password reset completed successfully for user: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. Please sign in with your new permanent password.',
    });
  } catch (error) {
    logger.error(`Reset Password Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'PASSWORD_RESET_FAILED',
      message: 'Failed to reset password. Please try again.',
    });
  }
}
