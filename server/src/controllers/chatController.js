import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { io } from '../server.js';
import xss from 'xss';

const userLastViewedAnnouncements = new Map();

async function getLastAnnouncementRead(userId) {
  try {
    const mem = userLastViewedAnnouncements.get(userId);
    if (mem) return mem;
    const record = await prisma.notification.findFirst({
      where: { recipientId: userId, type: 'LAST_ANNOUNCEMENT_READ' },
      orderBy: { updatedAt: 'desc' },
    });
    if (record) {
      const dt = new Date(record.updatedAt);
      userLastViewedAnnouncements.set(userId, dt);
      return dt;
    }
    return null;
  } catch {
    return null;
  }
}

async function setLastAnnouncementRead(userId) {
  try {
    const now = new Date();
    userLastViewedAnnouncements.set(userId, now);
    const existing = await prisma.notification.findFirst({
      where: { recipientId: userId, type: 'LAST_ANNOUNCEMENT_READ' },
    });
    if (existing) {
      await prisma.notification.update({
        where: { id: existing.id },
        data: { updatedAt: now, isRead: true },
      });
    } else {
      await prisma.notification.create({
        data: {
          recipientId: userId,
          type: 'LAST_ANNOUNCEMENT_READ',
          title: 'Last Seen Announcement',
          message: 'User read announcements',
          isRead: true,
        },
      });
    }
  } catch (err) {
    logger.warn(`Failed to persist last announcement read: ${err.message}`);
  }
}

/**
 * GET /api/v1/chat/messages
 * Fetch messages for ANNOUNCEMENT, COMMUNITY, or DIRECT channels
 */
export async function getMessages(req, res) {
  try {
    const { type = 'ANNOUNCEMENT', contactId, audit = 'false' } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let where = { type };

    if (type === 'COMMUNITY') {
      // Community Support is a private support desk between this user and Admin/Moderators
      if (userRole === 'ADMIN' || userRole === 'MODERATOR') {
        if (contactId) {
          // Admin/Mod viewing or replying to a specific user's support thread
          where = {
            type: 'COMMUNITY',
            OR: [
              { senderId: contactId },
              { recipientId: contactId },
            ],
          };
        } else {
          // Admin/Mod viewing general unassigned support queue
          where = { type: 'COMMUNITY' };
        }
      } else {
        // Students/Creators only see their own tickets
        where = {
          type: 'COMMUNITY',
          OR: [
            { senderId: userId },
            { recipientId: userId },
          ],
        };
      }
    } else if (type === 'DIRECT') {
      if (audit === 'true' && (userRole === 'ADMIN' || userRole === 'MODERATOR')) {
        where = { type: 'DIRECT' };
      } else {
        if (!contactId) {
          return res.status(200).json({ success: true, count: 0, messages: [] });
        }
        where = {
          type: 'DIRECT',
          OR: [
            { senderId: userId, recipientId: contactId },
            { senderId: contactId, recipientId: userId },
          ],
        };
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    // Mark unread direct messages as read
    if (type === 'DIRECT' && contactId) {
      await prisma.chatMessage.updateMany({
        where: {
          type: 'DIRECT',
          senderId: contactId,
          recipientId: userId,
          read: false,
        },
        data: { read: true },
      });
    } else if (type === 'ANNOUNCEMENT') {
      await setLastAnnouncementRead(userId);
    }

    return res.status(200).json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (error) {
    logger.error(`Get Chat Messages Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}

/**
 * POST /api/v1/chat/upload
 * Upload document or media attachment for chat
 */
export async function uploadChatFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'NO_FILE', message: 'No file uploaded.' });
    }
    const fileUrl = `/uploads/chat/${req.file.filename}`;
    return res.status(200).json({
      success: true,
      file: {
        fileUrl,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
      },
    });
  } catch (error) {
    logger.error(`Chat File Upload Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'UPLOAD_FAILED', message: error.message });
  }
}

/**
 * POST /api/v1/chat/messages
 * Send message to ANNOUNCEMENT (Admin only), COMMUNITY, or DIRECT
 */
export async function postMessage(req, res) {
  try {
    const { type, content, recipientId, fileUrl, fileName, fileType, fileSize } = req.body;
    const user = req.user;

    const trimmedContent = content?.trim() || '';
    if (!trimmedContent && !fileUrl) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_CONTENT',
        message: 'Message content or file attachment is required.',
      });
    }

    if (type === 'ANNOUNCEMENT' && user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Only system administrators can broadcast global announcements.',
      });
    }

    let targetUser = null;
    if (type === 'DIRECT') {
      if (!recipientId) {
        return res.status(400).json({ success: false, error: 'MISSING_RECIPIENT', message: 'Recipient is required for 1-on-1 direct messaging.' });
      }
      targetUser = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { id: true, name: true, role: true },
      });
      if (!targetUser) {
        return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'Recipient not found.' });
      }
    }

    const sanitizedContent = trimmedContent ? xss(trimmedContent) : (fileName || 'Attachment');

    const message = await prisma.chatMessage.create({
      data: {
        type: type || 'COMMUNITY',
        senderId: user.id,
        senderName: user.name,
        senderEmail: user.email,
        senderRole: user.role,
        recipientId: targetUser?.id || null,
        recipientName: targetUser?.name || null,
        recipientRole: targetUser?.role || null,
        content: sanitizedContent,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null,
        fileSize: fileSize ? Number(fileSize) : null,
      },
    });

    // Real-Time Socket.io Dispatch
    try {
      if (type === 'ANNOUNCEMENT') {
        io.emit('new_announcement', message);
      } else if (type === 'COMMUNITY') {
        io.emit('new_community_message', message);
      } else if (type === 'DIRECT') {
        // Send to recipient's private user room
        io.to(`user_${recipientId}`).emit('new_direct_message', message);
        // Send to sender's private user room as well (for multi-tab / other active devices)
        io.to(`user_${user.id}`).emit('new_direct_message', message);
        // Send to Admin audit room for real-time compliance oversight
        io.to('role_ADMIN').emit('admin_message_audit', message);
      }
    } catch (socketErr) {
      logger.warn(`Socket dispatch warning: ${socketErr.message}`);
    }

    return res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    logger.error(`Post Chat Message Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'SEND_FAILED', message: error.message });
  }
}

/**
 * GET /api/v1/chat/contacts
 * Returns safe list of active platform members for 1-on-1 direct messaging (name, role, avatar only)
 */
export async function getContacts(req, res) {
  try {
    const user = req.user;
    
    // Filter contacts: Non-admins cannot see administrator accounts
    const contactWhere = {
      id: { not: user.id },
      status: 'ACTIVE',
    };
    if (user.role !== 'ADMIN') {
      contactWhere.role = { not: 'ADMIN' };
    }

    const contacts = await prisma.user.findMany({
      where: contactWhere,
      select: { id: true, name: true, role: true, department: true, avatar: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      take: 100,
    });

    return res.status(200).json({
      success: true,
      contacts,
    });
  } catch (error) {
    logger.error(`Get Chat Contacts Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'CONTACTS_FAILED', message: error.message });
  }
}

/**
 * GET /api/v1/chat/unread-count
 * Returns badge count for unread direct messages and new announcements
 */
export async function getUnreadCount(req, res) {
  try {
    const userId = req.user.id;

    // 1. Unread direct messages
    const directCount = await prisma.chatMessage.count({
      where: {
        type: 'DIRECT',
        recipientId: userId,
        read: false,
      },
    });

    // 2. Unread announcements
    const lastViewed = await getLastAnnouncementRead(userId);
    let announcementCount = 0;
    if (lastViewed) {
      announcementCount = await prisma.chatMessage.count({
        where: {
          type: 'ANNOUNCEMENT',
          createdAt: { gt: lastViewed },
        },
      });
    } else {
      const threshold = req.user.createdAt ? new Date(req.user.createdAt) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      announcementCount = await prisma.chatMessage.count({
        where: {
          type: 'ANNOUNCEMENT',
          createdAt: { gt: threshold },
        },
      });
    }

    const count = directCount + announcementCount;

    return res.status(200).json({
      success: true,
      count,
      directCount,
      announcementCount,
    });
  } catch (error) {
    return res.status(200).json({ success: true, count: 0, directCount: 0, announcementCount: 0 });
  }
}

/**
 * POST /api/v1/chat/read-announcements
 * Marks all announcements as read for the current user
 */
export async function markAnnouncementsRead(req, res) {
  try {
    const userId = req.user.id;
    await setLastAnnouncementRead(userId);
    return res.status(200).json({ success: true, message: 'Announcements marked as read' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/chat/notifications
 * Returns list of recent notifications for the bell icon dropdown
 */
export async function getNotifications(req, res) {
  try {
    const userId = req.user.id;
    const lastViewed = (await getLastAnnouncementRead(userId)) || (req.user.createdAt ? new Date(req.user.createdAt) : new Date());

    // Fetch recent announcements
    const recentAnnouncements = await prisma.chatMessage.findMany({
      where: { type: 'ANNOUNCEMENT' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Fetch recent unread direct messages
    const recentDMs = await prisma.chatMessage.findMany({
      where: {
        type: 'DIRECT',
        recipientId: userId,
        read: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const notifications = [
      ...recentAnnouncements.map((a) => ({
        id: a.id,
        title: `Announcement by ${a.senderName}`,
        message: a.content,
        type: 'ANNOUNCEMENT',
        read: new Date(a.createdAt) <= new Date(lastViewed),
        createdAt: a.createdAt,
      })),
      ...recentDMs.map((dm) => ({
        id: dm.id,
        title: `Direct Message: ${dm.senderName}`,
        message: dm.content,
        type: 'DIRECT',
        read: false,
        createdAt: dm.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);

    const unreadCount = notifications.filter((n) => !n.read).length;

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    logger.error(`Get Notifications Error: ${error.message}`);
    return res.status(200).json({ success: true, notifications: [], unreadCount: 0 });
  }
}
