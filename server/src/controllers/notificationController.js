import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { io } from '../server.js';

/**
 * GET /api/v1/notifications
 * Returns paginated system notifications for current user & role
 */
export async function getNotifications(req, res) {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const where = {
      type: { notIn: ['ANNOUNCEMENT', 'COMMUNITY_SUPPORT', 'DIRECT_MESSAGE', 'LAST_ANNOUNCEMENT_READ'] },
      OR: [
        { recipientId: userId },
        { targetRole: userRole },
        { targetRole: 'ALL' },
      ],
    };

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Check underlying status for any enrollment requests to auto-clear completed workflows
    const enrollmentReqIds = notifications
      .filter((n) => n.type === 'ENROLLMENT_REQUEST')
      .map((n) => {
        try {
          const meta = typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata;
          return meta?.requestId;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const resolvedStatusMap = new Map();
    if (enrollmentReqIds.length > 0) {
      try {
        const reqs = await prisma.courseEnrollmentRequest.findMany({
          where: { id: { in: enrollmentReqIds } },
          select: { id: true, status: true },
        });
        for (const r of reqs) {
          resolvedStatusMap.set(r.id, r.status);
        }
      } catch {
        // fail silently if model query fails
      }
    }

    // Map user-specific read status for broadcast and action notifications
    const normalized = notifications.map((n) => {
      let isRead = Boolean(n.isRead);
      let meta = {};
      try {
        meta = n.metadata ? (typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata) : {};
      } catch {
        meta = {};
      }

      if (!isRead && n.targetRole && !n.recipientId) {
        if (Array.isArray(meta.readBy) && meta.readBy.includes(userId)) {
          isRead = true;
        }
      }

      // If enrollment request is already completed/progressed beyond this role's stage, consider it read
      if (!isRead && n.type === 'ENROLLMENT_REQUEST' && meta.requestId) {
        const reqStatus = resolvedStatusMap.get(meta.requestId);
        if (userRole === 'COURSE_CREATOR' && reqStatus && reqStatus !== 'PENDING_CREATOR') {
          isRead = true;
        } else if (userRole === 'ADMIN' && reqStatus && reqStatus !== 'FORWARDED_TO_ADMIN') {
          isRead = true;
        }
      }

      return { ...n, isRead };
    });

    const unreadCount = normalized.filter((n) => !n.isRead).length;

    return res.status(200).json({
      success: true,
      notifications: normalized,
      unreadCount,
    });
  } catch (error) {
    logger.error(`Get Notifications Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to retrieve notifications.' });
  }
}

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read
 */
export async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    // Verify user ownership or role authorization
    if (
      notification.recipientId &&
      notification.recipientId !== userId &&
      notification.targetRole !== userRole &&
      notification.targetRole !== 'ALL'
    ) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    let updated;
    if (notification.targetRole && !notification.recipientId) {
      // Role broadcast: persist read status per user in metadata
      let meta = {};
      try {
        meta = notification.metadata ? (typeof notification.metadata === 'string' ? JSON.parse(notification.metadata) : notification.metadata) : {};
      } catch {
        meta = {};
      }
      const readBy = Array.isArray(meta.readBy) ? [...meta.readBy] : [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
      }
      meta.readBy = readBy;
      updated = await prisma.notification.update({
        where: { id },
        data: { metadata: JSON.stringify(meta) },
      });
      updated = { ...updated, isRead: true };
    } else {
      updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });
    }

    if (io) {
      io.to(`user_${userId}`).emit('notifications_read', { id, isRead: true });
    }

    return res.status(200).json({
      success: true,
      notification: updated,
    });
  } catch (error) {
    logger.error(`Mark As Read Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to mark notification as read.' });
  }
}

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all notifications for current user/role as read
 */
export async function markAllAsRead(req, res) {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // 1. Mark personal direct notifications
    await prisma.notification.updateMany({
      where: {
        type: { notIn: ['ANNOUNCEMENT', 'COMMUNITY_SUPPORT', 'DIRECT_MESSAGE', 'LAST_ANNOUNCEMENT_READ'] },
        recipientId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    // 2. Mark role broadcast notifications for this user
    const broadcastNotifs = await prisma.notification.findMany({
      where: {
        type: { notIn: ['ANNOUNCEMENT', 'COMMUNITY_SUPPORT', 'DIRECT_MESSAGE', 'LAST_ANNOUNCEMENT_READ'] },
        recipientId: null,
        OR: [
          { targetRole: userRole },
          { targetRole: 'ALL' },
        ],
      },
      take: 50,
    });

    for (const bn of broadcastNotifs) {
      let meta = {};
      try {
        meta = bn.metadata ? (typeof bn.metadata === 'string' ? JSON.parse(bn.metadata) : bn.metadata) : {};
      } catch {
        meta = {};
      }
      const readBy = Array.isArray(meta.readBy) ? [...meta.readBy] : [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
        meta.readBy = readBy;
        await prisma.notification.update({
          where: { id: bn.id },
          data: { metadata: JSON.stringify(meta) },
        });
      }
    }

    if (io) {
      io.to(`user_${userId}`).emit('notifications_read', { all: true });
    }

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (error) {
    logger.error(`Mark All As Read Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to mark all as read.' });
  }
}

/**
 * PATCH /api/v1/notifications/read-by-link
 * Mark all notifications matching a link pattern or type as read
 */
export async function markAsReadByLink(req, res) {
  try {
    const { link, type } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const where = {
      type: { notIn: ['ANNOUNCEMENT', 'COMMUNITY_SUPPORT', 'DIRECT_MESSAGE', 'LAST_ANNOUNCEMENT_READ'] },
      OR: [
        { recipientId: userId },
        { targetRole: userRole },
        { targetRole: 'ALL' },
      ],
    };
    if (type) where.type = type;

    const notifications = await prisma.notification.findMany({
      where,
      take: 50,
    });

    const matching = link
      ? notifications.filter((n) => n.link && n.link.includes(link))
      : notifications;

    for (const notif of matching) {
      let meta = {};
      try {
        meta = notif.metadata ? (typeof notif.metadata === 'string' ? JSON.parse(notif.metadata) : notif.metadata) : {};
      } catch {
        meta = {};
      }
      const readBy = Array.isArray(meta.readBy) ? [...meta.readBy] : [];
      if (!readBy.includes(userId)) readBy.push(userId);
      meta.readBy = readBy;

      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          isRead: true,
          metadata: JSON.stringify(meta),
        },
      });
    }

    if (io) {
      io.to(`user_${userId}`).emit('notifications_read', { link, type, all: false });
    }

    return res.status(200).json({ success: true, count: matching.length });
  } catch (error) {
    logger.error(`Mark As Read By Link Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to mark notifications by link.' });
  }
}

/**
 * PATCH /api/v1/notifications/read-by-request
 * Mark notifications matching a specific requestId as read
 */
export async function markAsReadByRequest(req, res) {
  try {
    const { requestId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'requestId is required.' });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        type: 'ENROLLMENT_REQUEST',
        OR: [
          { recipientId: userId },
          { targetRole: userRole },
          { targetRole: 'ALL' },
        ],
      },
      take: 50,
    });

    const matching = notifications.filter((n) => {
      try {
        const meta = typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata;
        return meta?.requestId === requestId;
      } catch {
        return false;
      }
    });

    for (const notif of matching) {
      let meta = {};
      try {
        meta = notif.metadata ? (typeof notif.metadata === 'string' ? JSON.parse(notif.metadata) : notif.metadata) : {};
      } catch {
        meta = {};
      }
      const readBy = Array.isArray(meta.readBy) ? [...meta.readBy] : [];
      if (!readBy.includes(userId)) readBy.push(userId);
      meta.readBy = readBy;

      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          isRead: true,
          metadata: JSON.stringify(meta),
        },
      });
    }

    if (io) {
      io.to(`user_${userId}`).emit('notifications_read', { requestId });
    }

    return res.status(200).json({ success: true, count: matching.length });
  } catch (error) {
    logger.error(`Mark As Read By Request Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to mark notifications by request.' });
  }
}

