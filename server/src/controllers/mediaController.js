import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';
import { getFileStream, isR2Configured, generatePresignedDownloadUrl } from '../utils/r2Storage.js';

function getAccessSecret() {
  return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
}

function getRefreshSecret() {
  return process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET;
}

/**
 * Resolves user identity from Bearer header, URL query token (?token=...), or refresh cookie.
 */
async function authenticateMediaUser(req) {
  let token = null;

  // 1. Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Check query parameter (essential for cross-origin <video>, <img>, <a> downloads)
  if (!token && req.query.token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (token) {
    const accessSecret = getAccessSecret();
    if (accessSecret) {
      try {
        const decoded = jwt.verify(token, accessSecret, { algorithms: ['HS256'] });
        if (decoded?.sub) {
          const user = await prisma.user.findUnique({
            where: { id: decoded.sub },
            select: { id: true, role: true, status: true, email: true },
          });
          if (user && user.status !== 'SUSPENDED' && user.status !== 'LOCKED') {
            return user;
          }
        }
      } catch {
        // Access token expired or invalid; fall through to cookie
      }
    }
  }

  // 3. Check HTTP-only refresh cookie with ActiveSession revocation & expiry validation
  const refreshToken = req.cookies?.esmms_refresh_token;
  if (refreshToken) {
    const refreshSecret = getRefreshSecret();
    if (refreshSecret) {
      try {
        const decoded = jwt.verify(refreshToken, refreshSecret, { algorithms: ['HS256'] });
        if (decoded?.sub) {
          const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
          const session = await prisma.activeSession.findUnique({
            where: { refreshTokenHash },
            include: { user: true },
          });

          if (session && !session.isRevoked && new Date(session.expiresAt) > new Date()) {
            const user = session.user || (await prisma.user.findUnique({
              where: { id: session.userId },
              select: { id: true, role: true, status: true, email: true },
            }));

            if (user && user.status !== 'SUSPENDED' && user.status !== 'LOCKED' && user.status !== 'PENDING_APPROVAL') {
              return user;
            }
          }
        }
      } catch {
        // Invalid or expired refresh token
      }
    }
  }

  return null;
}

/**
 * Verifies access rights to course lesson materials.
 */
async function verifyLessonAccess(user, filename) {
  // Administrators and Moderators have system-wide viewing and auditing access
  if (user.role === 'ADMIN' || user.role === 'MODERATOR') {
    return true;
  }

  // Lookup lessons associated with this media file
  const lessons = await prisma.lesson.findMany({
    where: {
      OR: [
        { videoUrl: { contains: filename } },
        { content: { contains: filename } },
        { notes: { contains: filename } },
      ],
    },
    include: {
      section: {
        include: {
          module: {
            select: {
              id: true,
              status: true,
              createdBy: true,
              instructorId: true,
            },
          },
        },
      },
    },
  });

  // If file was recently uploaded before lesson was saved to database
  if (!lessons || lessons.length === 0) {
    if (user.role === 'COURSE_CREATOR') {
      return true; // Authoring preview
    }
    return false;
  }

  for (const lesson of lessons) {
    const module = lesson.section?.module;
    if (!module) continue;

    // Course Creator: allowed if author or instructor of the course
    if (user.role === 'COURSE_CREATOR') {
      if (module.createdBy === user.id || module.instructorId === user.id) {
        return true;
      }
    }

    // Enrolled student: check active non-expired assignment
    const assignment = await prisma.assignment.findUnique({
      where: {
        userId_moduleId: {
          userId: user.id,
          moduleId: module.id,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (assignment && assignment.status !== 'EXPIRED') {
      return true;
    }
  }

  return false;
}

/**
 * Verifies access rights to chat attachments.
 */
async function verifyChatAccess(user, filename) {
  // Administrators have global inspection access
  if (user.role === 'ADMIN') {
    return true;
  }

  const msg = await prisma.chatMessage.findFirst({
    where: {
      fileUrl: {
        contains: filename,
      },
    },
    select: {
      id: true,
      type: true,
      senderId: true,
      recipientId: true,
    },
  });

  // If file was uploaded right before message dispatch (in-flight pending upload):
  // Only the verified uploader who uploaded the file is allowed to access/preview it.
  if (!msg) {
    const pendingUploaderId = cache.get(`pending_chat:${filename}`);
    if (pendingUploaderId && pendingUploaderId === user.id) {
      return true;
    }
    return false;
  }

  // Community and Announcement channels are public to all authenticated members
  if (msg.type === 'COMMUNITY' || msg.type === 'ANNOUNCEMENT') {
    return true;
  }

  // Direct Messages: strictly restricted to conversation participants
  if (msg.type === 'DIRECT') {
    return user.id === msg.senderId || user.id === msg.recipientId;
  }

  return false;
}

/**
 * Streams media from Cloudflare R2 or local disk with HTTP Range and access control.
 * GET /uploads/:category/:filename
 * GET /api/v1/media/:category/:filename
 */
export async function streamMediaFile(req, res, next) {
  try {
    const { category, filename } = req.params;

    if (!['lessons', 'chat'].includes(category)) {
      if (typeof next === 'function') return next();
      return res.status(400).json({ success: false, message: 'Invalid media category requested.' });
    }

    const safeFilename = path.basename(filename);

    // 1. Authenticate Request
    const user = await authenticateMediaUser(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Authentication credentials are required to stream or download this resource.',
      });
    }

    // 2. Authorize Access
    if (category === 'lessons') {
      const isAuthorized = await verifyLessonAccess(user, safeFilename);
      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          error: 'NOT_ENROLLED',
          message: 'Active course enrollment approval is required to access or stream this lecture resource.',
        });
      }
    } else if (category === 'chat') {
      const isAuthorized = await verifyChatAccess(user, safeFilename);
      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_CHAT_ATTACHMENT',
          message: 'You are not authorized to view or download this private chat attachment.',
        });
      }
    }

    // 3. Stream File (R2 or Local Fallback)
    const rangeHeader = req.headers.range || null;
    const result = await getFileStream(category, safeFilename, rangeHeader);

    if (!result || !result.stream) {
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: 'Requested file could not be found in storage.',
      });
    }

    // 4. Set Response Headers
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', result.contentType || 'application/octet-stream');

    if (result.contentLength) {
      res.setHeader('Content-Length', result.contentLength);
    }

    if (result.contentRange) {
      res.setHeader('Content-Range', result.contentRange);
    }

    const ext = path.extname(safeFilename).toLowerCase();
    const isInlinePlayable = ['.mp4', '.webm', '.ogg', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);

    if (req.query.download === 'true' || !isInlinePlayable) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }

    res.status(result.statusCode || 200);

    // 5. Pipe Stream to Client
    if (typeof result.stream.pipe === 'function') {
      result.stream.pipe(res);
    } else {
      for await (const chunk of result.stream) {
        res.write(chunk);
      }
      res.end();
    }
  } catch (error) {
    logger.error(`Media Stream Controller Error: ${error.message}`);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to stream media file.' });
    }
  }
}
