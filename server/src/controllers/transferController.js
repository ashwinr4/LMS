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

    const normalizedRequests = requests.map((r) => {
      const user = r.user || {
        id: r.studentId || r.userId,
        name: r.studentName || r.userName || 'Student Candidate',
        email: r.studentEmail || r.userEmail || '',
        avatar: null,
        role: 'USER',
        department: r.department || null,
      };

      const course = r.course || {
        id: r.currentCourseId || r.courseId,
        title: r.currentCourse || r.courseTitle || 'Enrolled Course Curriculum',
      };

      const targetCourse = r.targetCourse && typeof r.targetCourse === 'object'
        ? r.targetCourse
        : (r.targetCourseId || r.targetCourse
            ? { id: r.targetCourseId, title: typeof r.targetCourse === 'string' ? r.targetCourse : 'Requested Curriculum Track' }
            : null);

      return {
        ...r,
        user,
        course,
        targetCourse,
        requestedDays: r.requestedDays || (r.currentDeadline && r.requestedDeadline
          ? Math.round((new Date(r.requestedDeadline) - new Date(r.currentDeadline)) / (1000 * 60 * 60 * 24))
          : 14),
      };
    });

    return res.status(200).json({
      success: true,
      requests: normalizedRequests,
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
      requestedDays = 14,
    } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reason for request is mandatory.',
      });
    }

    let courseTitle = 'Enrolled Course Curriculum';
    if (courseId) {
      const c = await prisma.module.findUnique({ where: { id: courseId }, select: { title: true } });
      if (c) courseTitle = c.title;
    }
    let targetTitle = null;
    if (targetCourseId) {
      const tc = await prisma.module.findUnique({ where: { id: targetCourseId }, select: { title: true } });
      if (tc) targetTitle = tc.title;
    }

    const typeLabelMap = {
      SLA_EXTENSION: 'SLA Deadline Extension',
      COURSE_TRANSFER: 'Course / Track Transfer',
      DEPARTMENT_TRANSFER: 'Department Reallocation',
    };

    const transfer = await prisma.transferRequest.create({
      data: {
        requestId: `TR-${Math.floor(1000 + Math.random() * 9000)}`,
        userId: req.user.id,
        studentId: req.user.id,
        studentName: req.user.name || 'Learner',
        studentEmail: req.user.email || '',
        department: req.user.department || fromDepartment || 'Engineering',
        type,
        typeLabel: typeLabelMap[type] || 'Course Transfer',
        courseId: courseId || null,
        currentCourseId: courseId || null,
        currentCourse: courseTitle,
        targetCourseId: targetCourseId || null,
        targetCourse: targetTitle,
        fromDepartment: fromDepartment || null,
        toDepartment: toDepartment || null,
        reason: reason.trim(),
        requestedDays: requestedDays ? Number(requestedDays) : 14,
        status: 'PENDING',
      },
    });

    const formattedTransfer = {
      ...transfer,
      user: {
        id: req.user.id,
        name: req.user.name || 'Learner',
        email: req.user.email,
        avatar: req.user.avatar || null,
        role: req.user.role || 'USER',
        department: req.user.department || 'Engineering',
      },
      course: { id: courseId, title: courseTitle },
      targetCourse: targetTitle ? { id: targetCourseId, title: targetTitle } : null,
    };

    if (io) {
      io.emit('transfer:created', formattedTransfer);
    }

    return res.status(201).json({
      success: true,
      message: 'Request submitted successfully.',
      transfer: formattedTransfer,
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
    if (existing.type === 'SLA_EXTENSION' && (existing.courseId || existing.currentCourseId) && existing.requestedDays) {
      const targetCourseId = existing.courseId || existing.currentCourseId;
      const targetUserId = existing.userId || existing.studentId;
      const assignment = await prisma.assignment.findFirst({
        where: {
          userId: targetUserId,
          moduleId: targetCourseId,
        },
      });

      if (assignment) {
        const currentDeadline = assignment.dueDate ? new Date(assignment.dueDate) : new Date();
        currentDeadline.setDate(currentDeadline.getDate() + Number(existing.requestedDays));
        await prisma.assignment.update({
          where: { id: assignment.id },
          data: { dueDate: currentDeadline },
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
