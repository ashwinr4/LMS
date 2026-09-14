import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { sendOtpEmail, sendWelcomeEmail } from '../utils/email.js';
import { io } from '../server.js';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'esmms_super_secure_access_token_secret_key_2026_x89';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'esmms_super_secure_refresh_token_secret_key_2026_y90';
const ACCESS_TOKEN_EXPIRES = '8h';
const REFRESH_TOKEN_EXPIRES_DAYS = 7;

function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      name: user.name,
      department: user.department,
    },
    JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      jti: crypto.randomUUID(),
    },
    JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_EXPIRES_DAYS}d` }
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
    maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
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
  role: z.enum(['ADMIN', 'MODERATOR', 'COURSE_CREATOR', 'USER']).optional().default('USER'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// 1. User Registration
export async function register(req, res) {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { name, email, password, department, role } = parseResult.data;

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email address already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const isModeratorRequest = role === 'MODERATOR';
    const initialStatus = isModeratorRequest ? 'PENDING_APPROVAL' : 'ACTIVE';

    const newUser = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        department: department || 'General',
        role: role || 'USER',
        status: initialStatus,
        requestedRole: isModeratorRequest ? 'MODERATOR' : null,
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
        actorId: newUser.id,
        actorEmail: newUser.email,
        actorName: newUser.name,
        action: 'USER_REGISTERED',
        resource: 'USER',
        details: isModeratorRequest
          ? 'User registered requesting Moderator role. Awaiting Administrator verification and permission setup.'
          : `User registered with role ${newUser.role}`,
        ipAddress: req.ip,
        riskLevel: 'LOW',
      },
    });

    if (isModeratorRequest) {
      try {
        await prisma.notification.create({
          data: {
            targetRole: 'ADMIN',
            title: '🛡️ Moderator Role Request',
            message: `${newUser.name} (${newUser.email}) requested Moderator privileges. Administrator verification and permission setup is required.`,
            type: 'SYSTEM',
            link: '/admin/approvals?tab=moderators',
          },
        });
        if (io) {
          io.to('role_ADMIN').emit('system_notification', {
            title: '🛡️ Moderator Role Request',
            message: `${newUser.name} requested Moderator access.`,
            type: 'SYSTEM',
            link: '/admin/approvals?tab=moderators',
          });
          io.to('role_ADMIN').emit('admin_new_request', {
            title: 'Moderator Request',
            user: newUser,
          });
        }
      } catch (notifErr) {
        logger.warn(`Moderator request notification error: ${notifErr.message}`);
      }

      return res.status(201).json({
        success: true,
        pendingApproval: true,
        message: 'Your account has been registered. Moderator privileges require administrator verification and permission assignment before activation.',
        user: newUser,
      });
    }

    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    const refreshTokenHash = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await prisma.activeSession.create({
      data: {
        userId: newUser.id,
        refreshTokenHash,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'Unknown',
        expiresAt,
      },
    });

    setRefreshTokenCookie(res, refreshToken);

    logger.info(`User Registered successfully: ${newUser.email} (${newUser.role})`);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user: newUser,
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

// 2. User Login with Brute-Force Lockout
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
    const normalizedEmail = email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
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

    // Password Valid: Generate 6-Digit OTP for mandatory 2FA verification
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockUntil: null,
        otpCode: hashToken(otp),
        otpExpires,
      },
    });

    // Dispatch Live 6-Digit Passcode asynchronously via Gmail SMTP (non-blocking)
    sendOtpEmail(user.email, otp, user.name, 'Sign In').catch((emailErr) => {
      logger.warn(`Could not dispatch OTP email: ${emailErr.message}`);
    });

    logger.info(`Login 2FA OTP generated and dispatched for: ${user.email}`);

    return res.status(200).json({
      success: true,
      requiresOtp: true,
      email: user.email,
      mustChangePassword: Boolean(user.mustChangePassword),
      message: user.mustChangePassword
        ? `Temporary credentials detected. A 6-digit verification code has been dispatched to ${user.email}.`
        : `A 6-digit verification code has been dispatched to ${user.email}.`,
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

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

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
    const rawRefreshToken = req.cookies?.esmms_refresh_token;

    if (!rawRefreshToken) {
      return res.status(401).json({
        success: false,
        error: 'REFRESH_TOKEN_REQUIRED',
        message: 'No refresh token provided in cookies.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(rawRefreshToken, JWT_REFRESH_SECRET);
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

    // Invalidate previous session token (One-Time Use Token Rotation)
    await prisma.activeSession.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    // Generate new token pair
    const newAccessToken = generateAccessToken(session.user);
    const newRefreshToken = generateRefreshToken(session.user);
    const newRefreshTokenHash = hashToken(newRefreshToken);

    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await prisma.activeSession.create({
      data: {
        userId: session.user.id,
        refreshTokenHash: newRefreshTokenHash,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'Rotated Session',
        expiresAt: newExpiresAt,
      },
    });

    setRefreshTokenCookie(res, newRefreshToken);

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        status: session.user.status,
        department: session.user.department,
        avatar: session.user.avatar,
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
    const rawRefreshToken = req.cookies?.esmms_refresh_token;

    if (rawRefreshToken) {
      const incomingHash = hashToken(rawRefreshToken);
      await prisma.activeSession.updateMany({
        where: { refreshTokenHash: incomingHash },
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

// 7. Request 2FA OTP
export async function requestOtp(req, res) {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'No account with this email address was found.',
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: hashToken(otp),
        otpExpires,
      },
    });

    // Dispatch live email via Gmail SMTP
    await sendOtpEmail(user.email, otp, user.name);

    logger.info(`2FA OTP generated and dispatched for ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'One-time verification code has been dispatched to your email.',
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

// 8. Verify 2FA OTP
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
        message: 'No active OTP request found. Please sign in again to receive a fresh code.',
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

    // Clear used OTP and update lastActive
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: null,
        otpExpires: null,
        lastActive: new Date(),
      },
    });

    // Detect first-time login dynamically
    const sessionCount = await prisma.activeSession.count({
      where: { userId: user.id },
    }).catch(() => 0);

    if (sessionCount === 0) {
      sendWelcomeEmail(user.email, user.name, user.role).catch((welcomeErr) => {
        logger.warn(`Could not dispatch welcome email to ${user.email}: ${welcomeErr.message}`);
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    const refreshTokenHash = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    try {
      await prisma.activeSession.create({
        data: {
          userId: user.id,
          refreshTokenHash,
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.headers['user-agent'] || '2FA Session',
          expiresAt,
        },
      });
    } catch (sessionErr) {
      logger.warn(`ActiveSession creation note: ${sessionErr.message}`);
    }

    setRefreshTokenCookie(res, refreshToken);

    try {
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          actorEmail: user.email,
          actorName: user.name,
          action: 'USER_LOGIN_OTP_VERIFIED',
          resource: 'AUTH',
          details: 'User verified 2FA OTP and signed in.',
          ipAddress: req.ip || '127.0.0.1',
          riskLevel: 'LOW',
        },
      });
    } catch (auditErr) {
      logger.warn(`AuditLog creation note: ${auditErr.message}`);
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
        message: '2FA verification successful.',
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
    logger.error(`Verify OTP Error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'OTP_VERIFICATION_FAILED',
      message: error.message || 'Failed to verify code.',
    });
  }
}

const pendingGoogleRegistrations = new Map();

// 9. Google Single Sign-On (SSO) Controller
export async function googleLogin(req, res) {
  try {
    const { credential, profile, role, department, otpCode } = req.body;

    let email = null;
    let name = null;
    let avatar = null;

    if (credential) {
      try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        if (verifyRes.ok) {
          const payload = await verifyRes.json();
          email = payload.email?.toLowerCase();
          name = payload.name || payload.given_name || 'Google Member';
          avatar = payload.picture;
        }
      } catch (err) {
        logger.warn(`Google tokeninfo verification network note: ${err.message}`);
      }

      if (!email) {
        const decoded = jwt.decode(credential);
        if (decoded && decoded.email) {
          email = decoded.email.toLowerCase();
          name = decoded.name || 'Google Member';
          avatar = decoded.picture;
        }
      }
    } else if (profile && profile.email) {
      email = profile.email.toLowerCase();
      name = profile.name || 'Google Member';
      avatar = profile.avatar;
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_GOOGLE_CREDENTIAL',
        message: 'Could not extract valid profile details from Google account.',
      });
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    // ── STAGE 1 & 2: NEW USER ONBOARDING (Role Selection & OTP) ──
    if (!user) {
      // Step A: Prompt user to choose their target role
      if (!role) {
        return res.status(200).json({
          success: true,
          requiresOnboarding: true,
          googleProfile: {
            email,
            name: name || email.split('@')[0],
            avatar,
          },
          message: 'Please choose your target role and complete verification.',
        });
      }

      // Step B: Role provided, dispatch OTP verification passcode
      if (!otpCode) {
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        pendingGoogleRegistrations.set(email.toLowerCase(), {
          email: email.toLowerCase(),
          name: name || email.split('@')[0],
          avatar,
          role,
          department: department || 'Engineering',
          otp: generatedOtp,
          expires: Date.now() + 10 * 60 * 1000,
        });

        sendOtpEmail(email, generatedOtp, name, 'Google Account Onboarding').catch((emailErr) => {
          logger.warn(`Could not dispatch Google onboarding OTP email: ${emailErr.message}`);
        });

        logger.info(`Google onboarding OTP dispatched to ${email} for role: ${role}`);

        return res.status(200).json({
          success: true,
          requiresOtp: true,
          email,
          role,
          department,
          message: `A 6-digit verification code has been dispatched to ${email}.`,
        });
      }

      // Step C: Verify OTP passcode and provision user
      const pending = pendingGoogleRegistrations.get(email.toLowerCase());
      if (!pending || pending.otp !== otpCode.trim() || Date.now() > pending.expires) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_OTP',
          message: 'Invalid or expired verification passcode. Please try again.',
        });
      }

      const dummyPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
      user = await prisma.user.create({
        data: {
          email,
          name: pending.name || name || email.split('@')[0],
          passwordHash: dummyPassword,
          role: pending.role || role || 'USER',
          status: 'ACTIVE',
          department: pending.department || department || 'General',
          avatar: pending.avatar || avatar,
        },
      });

      pendingGoogleRegistrations.delete(email.toLowerCase());

      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          actorEmail: user.email,
          actorName: user.name,
          action: 'USER_REGISTERED_GOOGLE_SSO',
          resource: 'AUTH',
          details: `User provisioned via Google SSO with role ${user.role} after OTP verification`,
          ipAddress: req.ip,
          riskLevel: 'LOW',
        },
      });

      logger.info(`New user provisioned via Google SSO on Neon DB: ${user.email} (${user.role})`);
    } else {
      // ── EXISTING USER LOGIN ──
      if (user.status === 'LOCKED' || user.status === 'SUSPENDED') {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_LOCKED',
          message: `Your account status is ${user.status}. Please contact your administrator.`,
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

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

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
        avatar: user.avatar,
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
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
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

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorName: req.user.name,
        action: 'USER_PASSWORD_CHANGED',
        resource: 'AUTH',
        details: 'User established permanent credentials.',
        ipAddress: req.ip || '127.0.0.1',
        riskLevel: 'LOW',
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
