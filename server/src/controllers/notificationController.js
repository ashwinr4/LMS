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

    // Map user-specific read status for broadcast notifications
    const normalized = notifications.map((n) => {
      let isRead = n.isRead;
      if (n.targetRole && !n.recipientId) {
        try {
          const meta = n.metadata ? (typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata) : {};
          isRead = Array.isArray(meta.readBy) ? meta.readBy.includes(userId) : n.isRead;
        } catch {
          isRead = n.isRead;
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
