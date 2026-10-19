import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

function getAccessSecret() {
  return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
}

/**
 * Socket.IO Connection Authentication Middleware
 * Strictly enforces valid JWT token on handshake.
 * Rejects unauthenticated connections.
 */
export function authenticateSocket(socket, next) {
  const token =
    socket.handshake.auth?.token ||
    (socket.handshake.headers?.authorization && socket.handshake.headers.authorization.split(' ')[1]);

  if (!token) {
    logger.warn(`WebSocket connection rejected: No authentication token provided. Socket: ${socket.id}`);
    return next(new Error('AUTHENTICATION_REQUIRED: Missing authentication token.'));
  }

  const secret = getAccessSecret();
  if (!secret) {
    logger.error('WebSocket connection rejected: JWT access secret is not configured.');
    return next(new Error('SERVER_CONFIGURATION_ERROR: Authentication unavailable.'));
  }

  try {
    const decoded = jwt.verify(token, secret);
    socket.user = {
      ...decoded,
      id: decoded.id || decoded.sub,
    };
    socket.userId = socket.user.id;
    socket.userRole = decoded.role;
    next();
  } catch (err) {
    logger.warn(`WebSocket connection rejected: Invalid or expired token (${err.message}). Socket: ${socket.id}`);
    return next(new Error(`INVALID_TOKEN: Authentication token is invalid or expired.`));
  }
}

/**
 * Verifies whether an authenticated user has permission to join a specific course room.
 *
 * Authorization rules:
 * - Administrators and Moderators: permitted for all courses.
 * - Course Creators: permitted only for courses they created or instruct.
 * - Students / Users: permitted only if actively enrolled (assignment exists and not expired).
 *
 * @param {object} user - Authenticated user payload from JWT
 * @param {string} courseId - Target course / module UUID
 * @param {object} [dbClient=prisma] - Database client (allows dependency injection for testing)
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
export async function canUserAccessCourseRoom(user, courseId, dbClient = prisma) {
  const userId = user?.id || user?.sub;
  if (!user || !userId) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

  if (!courseId || typeof courseId !== 'string' || !courseId.trim()) {
    return { allowed: false, reason: 'INVALID_COURSE_ID' };
  }

  const cleanCourseId = courseId.trim();

  // 1. Administrators and Moderators have global monitoring access
  if (user.role === 'ADMIN' || user.role === 'MODERATOR') {
    return { allowed: true };
  }

  // 2. Fetch course module metadata
  let moduleRecord = null;
  try {
    moduleRecord = await dbClient.module.findUnique({
      where: { id: cleanCourseId },
      select: { id: true, createdBy: true, instructorId: true, status: true },
    });
  } catch (err) {
    logger.error(`Error checking course room access for module ${cleanCourseId}: ${err.message}`);
    return { allowed: false, reason: 'DATABASE_ERROR' };
  }

  if (!moduleRecord) {
    return { allowed: false, reason: 'COURSE_NOT_FOUND' };
  }

  // 3. Course Creator Ownership Check
  if (user.role === 'COURSE_CREATOR') {
    const isOwner = moduleRecord.createdBy === userId || moduleRecord.instructorId === userId;
    if (isOwner) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'FORBIDDEN_COURSE_CREATOR_NOT_OWNER' };
  }

  // Unapproved DRAFT courses cannot be accessed by ordinary students
  if (moduleRecord.status === 'DRAFT') {
    return { allowed: false, reason: 'COURSE_DRAFT_RESTRICTED' };
  }

  // 4. Student Enrollment Check
  try {
    const assignment = await dbClient.assignment.findUnique({
      where: {
        userId_moduleId: {
          userId,
          moduleId: cleanCourseId,
        },
      },
      select: { status: true },
    });

    if (!assignment) {
      return { allowed: false, reason: 'NOT_ENROLLED' };
    }

    if (assignment.status === 'EXPIRED') {
      return { allowed: false, reason: 'ENROLLMENT_EXPIRED' };
    }

    return { allowed: true };
  } catch (err) {
    logger.error(`Error checking assignment for user ${userId} and course ${cleanCourseId}: ${err.message}`);
    return { allowed: false, reason: 'DATABASE_ERROR' };
  }
}
