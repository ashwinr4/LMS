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
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
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

/**
 * Production Socket.IO Handler Registration
 * Registers event listeners for authenticated socket connections.
 * Shared between production server initialization and integration test suites.
 *
 * @param {object} socket - Connected Socket.IO socket instance
 * @param {object} io - Socket.IO server instance
 * @param {object} [dbClient=prisma] - Database client (allows dependency injection for testing)
 */
export function registerSocketHandlers(socket, io, dbClient = prisma) {
  // Join role room (Authenticated and verified role only)
  socket.on('join_role_room', (role) => {
    if (!socket.user || (socket.user.role !== role && socket.user.role !== 'ADMIN')) {
      logger.warn(`Unauthorized WebSocket role room subscription attempt: socket ${socket.id} attempted to join role_${role}`);
      socket.emit('socket_error', {
        event: 'join_role_room',
        error: 'FORBIDDEN_ROLE_ROOM',
        message: `You are not authorized to subscribe to role_${role}.`,
      });
      return;
    }
    const room = `role_${role}`;
    socket.join(room);
    socket.emit('room_joined', { room, success: true });
    logger.info(`Socket ${socket.id} joined role room: ${room}`);
  });

  // Join user room for targeted notifications (Authenticated self or admin only)
  socket.on('join_user_room', (userId) => {
    const callerId = socket.user?.sub || socket.user?.id;
    if (!socket.user || (callerId !== userId && socket.user.role !== 'ADMIN')) {
      logger.warn(`Unauthorized WebSocket user room subscription attempt: socket ${socket.id} attempted to join user_${userId}`);
      socket.emit('socket_error', {
        event: 'join_user_room',
        error: 'FORBIDDEN_USER_ROOM',
        message: `You are not authorized to subscribe to user_${userId}.`,
      });
      return;
    }
    const room = `user_${userId}`;
    socket.join(room);
    socket.emit('room_joined', { room, success: true });
    logger.info(`Socket ${socket.id} joined user room: ${room}`);
  });

  // Join course room for real-time curriculum and player updates (Strictly authorized)
  socket.on('join_course_room', async (courseId) => {
    if (!courseId) return;

    try {
      const access = await canUserAccessCourseRoom(socket.user, courseId, dbClient);
      if (!access.allowed) {
        logger.warn(
          `Unauthorized WebSocket course room join attempt: user ${socket.user?.id} (${socket.user?.role}) denied for course ${courseId}. Reason: ${access.reason}`
        );
        socket.emit('socket_error', {
          event: 'join_course_room',
          error: 'FORBIDDEN_COURSE_ACCESS',
          message: 'You are not authorized to join updates for this course room.',
          reason: access.reason,
        });
        return;
      }

      const room = `course_${courseId}`;
      socket.join(room);
      socket.emit('room_joined', { room, success: true });
      logger.info(`Socket ${socket.id} (User: ${socket.user?.id}) joined course room: ${room}`);
    } catch (err) {
      logger.error(`Error validating course room join for socket ${socket.id}: ${err.message}`);
    }
  });

  socket.on('leave_course_room', (courseId) => {
    if (courseId) {
      const room = `course_${courseId}`;
      socket.leave(room);
      socket.emit('room_left', { room, success: true });
      logger.info(`Socket ${socket.id} left course room: ${room}`);
    }
  });

  socket.on('disconnect', () => {
    logger.info(`WebSocket Client Disconnected: ${socket.id}`);
  });
}

