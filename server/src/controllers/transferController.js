import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { io } from '../server.js';

/**
 * GET /api/v1/transfers
 * List transfer and SLA extension requests with real database backing & counts
 */
export async function listTransfers(req, res) {
  try {
    const { status, type, search } = req.query;

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (type && type !== 'ALL') {
      where.type = type;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { reason: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [requests, pendingCount, approvedCount, rejectedCount, totalCount] = await Promise.all([
      prisma.transferRequest.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
              department: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
            },
          },
          targetCourse: {
            select: {
              id: true,
              title: true,
            },
          },
          reviewedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.transferRequest.count({ where: { status: 'PENDING' } }),
      prisma.transferRequest.count({ where: { status: 'APPROVED' } }),
      prisma.transferRequest.count({ where: { status: 'REJECTED' } }),
      prisma.transferRequest.count(),
    ]);

    return res.status(200).json({
      success: true,
      requests,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: totalCount,
      },
    });
  } catch (error) {
    logger.error('Error in listTransfers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transfer requests.',
      error: error.message,
    });
  }
}

/**
 * POST /api/v1/transfers
 * Create a new transfer or SLA extension request
 */
export async function createTransfer(req, res) {
  try {
    const {
      type = 'COURSE_TRANSFER',
      courseId,
      targetCourseId,
      fromDepartment,
      toDepartment,
      reason,
      requestedDays,
    } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reason for request is mandatory.',
      });
    }

    const transfer = await prisma.transferRequest.create({
      data: {
        userId: req.user.id,
        type,
        courseId: courseId || null,
        targetCourseId: targetCourseId || null,
        fromDepartment: fromDepartment || null,
        toDepartment: toDepartment || null,
        reason: reason.trim(),
        requestedDays: requestedDays ? Number(requestedDays) : null,
        status: 'PENDING',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
            department: true,
          },
        },
        course: { select: { id: true, title: true } },
        targetCourse: { select: { id: true, title: true } },
      },
    });

    if (io) {
      io.emit('transfer:created', transfer);
    }

    return res.status(201).json({
      success: true,
      message: 'Request submitted successfully.',
      transfer,
    });
  } catch (error) {
    logger.error('Error in createTransfer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit transfer request.',
      error: error.message,
    });
  }
}

/**
 * PATCH /api/v1/transfers/:id/approve
 * Authorize / Approve a transfer or SLA extension request
 */
export async function approveTransfer(req, res) {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};

    const existing = await prisma.transferRequest.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Transfer request not found.',
      });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Request is already ${existing.status.toLowerCase()}.`,
      });
    }

    // Process type-specific logic
    if (existing.type === 'SLA_EXTENSION' && existing.courseId && existing.requestedDays) {
      // Extend enrollment deadline if exists
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          userId: existing.userId,
          courseId: existing.courseId,
        },
      });

      if (enrollment && enrollment.slaDeadline) {
        const currentDeadline = new Date(enrollment.slaDeadline);
        currentDeadline.setDate(currentDeadline.getDate() + Number(existing.requestedDays));
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { slaDeadline: currentDeadline },
        });
      }
    } else if (existing.type === 'DEPARTMENT_TRANSFER' && existing.toDepartment) {
      // Only staff roles have departments
      if (existing.user && existing.user.role !== 'USER') {
        await prisma.user.update({
          where: { id: existing.userId },
          data: { department: existing.toDepartment },
        });
      }
    }

    const updated = await prisma.transferRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        reason: notes ? `${existing.reason}\n\n[Approval Note]: ${notes}` : existing.reason,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
            department: true,
          },
        },
        course: { select: { id: true, title: true } },
        targetCourse: { select: { id: true, title: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Create notification for requester
    try {
      await prisma.notification.create({
        data: {
          userId: existing.userId,
          title: 'Request Approved',
          message: `Your ${existing.type.replace(/_/g, ' ').toLowerCase()} request has been approved.`,
          type: 'SYSTEM',
        },
      });
    } catch (_) {
      // continue even if notification schema differs slightly
    }

    if (io) {
      io.emit('transfer:updated', updated);
    }

    return res.status(200).json({
      success: true,
      message: 'Request approved successfully.',
      transfer: updated,
    });
  } catch (error) {
    logger.error('Error in approveTransfer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve request.',
      error: error.message,
    });
  }
}

/**
 * PATCH /api/v1/transfers/:id/reject
 * Reject a transfer or SLA extension request
 */
export async function rejectTransfer(req, res) {
  try {
    const { id } = req.params;
    const { reason = 'Request denied by moderator/admin.' } = req.body || {};

    const existing = await prisma.transferRequest.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Transfer request not found.',
      });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Request is already ${existing.status.toLowerCase()}.`,
      });
    }

    const updated = await prisma.transferRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        reason: `${existing.reason}\n\n[Rejection Reason]: ${reason}`,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
            department: true,
          },
        },
        course: { select: { id: true, title: true } },
        targetCourse: { select: { id: true, title: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Create notification for requester
    try {
      await prisma.notification.create({
        data: {
          userId: existing.userId,
          title: 'Request Rejected',
          message: `Your ${existing.type.replace(/_/g, ' ').toLowerCase()} request was rejected: ${reason}`,
          type: 'SYSTEM',
        },
      });
    } catch (_) {
      // continue
    }

    if (io) {
      io.emit('transfer:updated', updated);
    }

    return res.status(200).json({
      success: true,
      message: 'Request rejected.',
      transfer: updated,
    });
  } catch (error) {
    logger.error('Error in rejectTransfer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject request.',
      error: error.message,
    });
  }
}
