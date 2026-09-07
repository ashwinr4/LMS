import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'esmms_super_secure_access_token_secret_key_2026_x89';

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

    jwt.verify(token, JWT_ACCESS_SECRET, async (err, decoded) => {
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
