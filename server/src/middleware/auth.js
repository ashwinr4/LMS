import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

function getAccessSecret() {
  return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
}

export async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_TOKEN_REQUIRED',
        message: 'Authentication token missing. Please sign in.',
      });
    }

    const secret = getAccessSecret();
    if (!secret) {
      logger.error('CRITICAL: JWT access secret is not configured.');
      return res.status(500).json({
        success: false,
        error: 'SERVER_CONFIGURATION_ERROR',
        message: 'Authentication service is misconfigured.',
      });
    }

    jwt.verify(token, secret, async (err, decoded) => {
      if (err) {
        return res.status(401).json({
          success: false,
          error: 'AUTH_TOKEN_EXPIRED_OR_INVALID',
          message: 'Access token expired or invalid. Please refresh token.',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          department: true,
          avatar: true,
          lockUntil: true,
          moderatorPermissions: true,
          requestedRole: true,
        },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User account not found.',
        });
      }

      if (user.status === 'LOCKED' && user.lockUntil && new Date(user.lockUntil) > new Date()) {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_LOCKED',
          message: 'Account is temporarily locked due to security policy. Please try again later.',
        });
      }

      if (user.status === 'SUSPENDED') {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_SUSPENDED',
          message: 'Account has been suspended by an administrator.',
        });
      }

      if (user.status === 'PENDING_APPROVAL') {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_PENDING_APPROVAL',
          message: 'Account pending administrator verification and activation.',
        });
      }

      req.user = user;
      next();
    });
  } catch (error) {
    logger.error(`Authentication Middleware Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'AUTH_INTERNAL_ERROR',
      message: 'An internal authentication error occurred.',
    });
  }
}

/**
 * Optional Authentication: Attaches req.user if a valid token is present;
 * otherwise leaves req.user null and continues without failing.
 */
export async function optionalAuthenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      req.user = null;
      return next();
    }

    const secret = getAccessSecret();
    if (!secret) {
      req.user = null;
      return next();
    }

    jwt.verify(token, secret, async (err, decoded) => {
      if (err || !decoded?.sub) {
        req.user = null;
        return next();
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: decoded.sub },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            department: true,
            avatar: true,
            lockUntil: true,
            moderatorPermissions: true,
            requestedRole: true,
          },
        });
        req.user = user || null;
      } catch {
        req.user = null;
      }
      next();
    });
  } catch {
    req.user = null;
    next();
  }
}

export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Forbidden RBAC Access: User ${req.user.email} (${req.user.role}) attempted to access restricted endpoint.`);
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_ROLE',
        message: `Access denied. Required role(s): [${allowedRoles.join(', ')}].`,
      });
    }

    next();
  };
}

export function requireActiveStatus(req, res, next) {
  if (!req.user || req.user.status !== 'ACTIVE') {
    return res.status(403).json({
      success: false,
      error: 'ACCOUNT_NOT_ACTIVE',
      message: 'Your account is not active.',
    });
  }
  next();
}

/**
 * Granular Moderator Permission Guard
 * Allows ADMIN unconditionally; for MODERATOR, verifies moduleName.action in user's permissions
 */
export function requireModeratorPermission(moduleName, action) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      });
    }

    // Administrators always possess full operational authority
    if (req.user.role === 'ADMIN') {
      return next();
    }

    if (req.user.role !== 'MODERATOR') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_ROLE',
        message: 'Access restricted to operational Moderators and Administrators.',
      });
    }

    let perms = {};
    try {
      if (req.user.moderatorPermissions) {
        perms =
          typeof req.user.moderatorPermissions === 'string'
            ? JSON.parse(req.user.moderatorPermissions)
            : req.user.moderatorPermissions;
      }
    } catch {
      perms = {};
    }

    const isPermitted = Boolean(perms[moduleName]?.[action]);

    if (!isPermitted) {
      logger.warn(`Moderator Permission Denied: ${req.user.email} lacking '${moduleName}.${action}'`);
      return res.status(403).json({
        success: false,
        error: 'MODERATOR_PERMISSION_DENIED',
        message: `Access denied. Your Moderator account does not have authorization for: [${moduleName} -> ${action}].`,
      });
    }

    next();
  };
}
