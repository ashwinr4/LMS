import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

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

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({
        where: {
          ...where,
          isRead: false,
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      notifications,
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

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

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

    await prisma.notification.updateMany({
      where: {
        type: { notIn: ['ANNOUNCEMENT', 'COMMUNITY_SUPPORT', 'DIRECT_MESSAGE', 'LAST_ANNOUNCEMENT_READ'] },
        OR: [
          { recipientId: userId },
          { targetRole: userRole },
          { targetRole: 'ALL' },
        ],
        isRead: false,
      },
      data: { isRead: true },
    });

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (error) {
    logger.error(`Mark All As Read Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to mark all as read.' });
  }
}
