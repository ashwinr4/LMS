import { prisma, getActiveEngine } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { io } from '../server.js';
import { cache } from '../utils/cache.js';

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

    // Role-based scoping: Normal USER accounts can only see their own transfer requests
    if (req.user && req.user.role === 'USER') {
      where.studentId = req.user.id;
    }

    // Moderator check: Enforce transfers.view permission for MODERATOR accounts
    if (req.user && req.user.role === 'MODERATOR') {
      let perms = {};
      try {
        perms = typeof req.user.moderatorPermissions === 'string'
          ? JSON.parse(req.user.moderatorPermissions)
          : req.user.moderatorPermissions || {};
      } catch {
        perms = {};
      }
      if (!perms.transfers?.view) {
        return res.status(403).json({
          success: false,
          error: 'MODERATOR_PERMISSION_DENIED',
          message: 'Access denied. Your Moderator account does not have authorization for: [transfers -> view].',
        });
      }
    }

    const baseCountWhere = req.user && req.user.role === 'USER' ? { studentId: req.user.id } : {};

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
      prisma.transferRequest.count({ where: { ...baseCountWhere, status: 'PENDING' } }),
      prisma.transferRequest.count({ where: { ...baseCountWhere, status: 'APPROVED' } }),
      prisma.transferRequest.count({ where: { ...baseCountWhere, status: 'REJECTED' } }),
      prisma.transferRequest.count({ where: baseCountWhere }),
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
      error: 'FETCH_FAILED',
      message: 'Failed to fetch transfer requests.',
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
    if (type === 'COURSE_TRANSFER') {
      if (!targetCourseId) {
        return res.status(400).json({
          success: false,
          message: 'Target course is mandatory for course transfer.',
        });
      }
      const tc = await prisma.module.findUnique({
        where: { id: targetCourseId },
        select: { id: true, title: true, status: true, expiresAt: true },
      });
      if (!tc || tc.status !== 'ACTIVE') {
        return res.status(400).json({
          success: false,
          error: 'COURSE_NOT_ACTIVE',
          message: 'Target course for transfer is not active or available.',
        });
      }
      if (tc.expiresAt && new Date(tc.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({
          success: false,
          error: 'COURSE_EXPIRED',
          message: 'Target course has expired and is no longer available for transfer.',
        });
      }
      targetTitle = tc.title;
    } else if (targetCourseId) {
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
      io.to('role_ADMIN').to('role_MODERATOR').to(`user_${req.user.id}`).emit('transfer:created', formattedTransfer);
    }
    cache.invalidatePrefix('admin:');

    return res.status(201).json({
      success: true,
      message: 'Request submitted successfully.',
      transfer: formattedTransfer,
    });
  } catch (error) {
    logger.error('Error in createTransfer:', error);
    return res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: 'Failed to submit transfer request.',
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

    // Guard against partial data corruption on engines lacking atomic multi-record rollback
    if (getActiveEngine() === 'mongodb') {
      return res.status(409).json({
        success: false,
        error: 'TRANSACTION_NOT_SUPPORTED',
        message:
          'Transfer approval requires multi-record atomic rollback, which is not supported by the active MongoDB provider. To prevent partial state corruption, transfer approvals are blocked on MongoDB. Switch the primary engine to PostgreSQL to execute this operation safely.',
      });
    }

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

    let updated;

    // Process type-specific logic atomically
    if (existing.type === 'SLA_EXTENSION' && (existing.courseId || existing.currentCourseId) && existing.requestedDays) {
      const targetCourseId = existing.courseId || existing.currentCourseId;
      const targetUserId = existing.userId || existing.studentId;

      updated = await prisma.$transaction(async (tx) => {
        const assignment = await tx.assignment.findFirst({
          where: {
            userId: targetUserId,
            moduleId: targetCourseId,
          },
        });

        if (assignment) {
          const currentDeadline = assignment.dueDate ? new Date(assignment.dueDate) : new Date();
          currentDeadline.setDate(currentDeadline.getDate() + Number(existing.requestedDays));
          await tx.assignment.update({
            where: { id: assignment.id },
            data: { dueDate: currentDeadline },
          });
        }

        return await tx.transferRequest.update({
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
      });
    } else if (existing.type === 'COURSE_TRANSFER') {
      const studentId = existing.studentId || existing.userId;
      const targetCourseId = existing.targetCourseId;
      const sourceCourseId = existing.currentCourseId || existing.courseId;

      if (!targetCourseId) {
        return res.status(400).json({
          success: false,
          message: 'Transfer request is missing target course specification.',
        });
      }

      // Verify target module exists and is active
      const targetModule = await prisma.module.findUnique({
        where: { id: targetCourseId },
      });
      if (!targetModule || targetModule.status !== 'ACTIVE') {
        return res.status(400).json({
          success: false,
          error: 'COURSE_NOT_ACTIVE',
          message: 'Target course for transfer does not exist, is inactive, or has been removed.',
        });
      }
      if (targetModule.expiresAt && new Date(targetModule.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({
          success: false,
          error: 'COURSE_EXPIRED',
          message: 'Target course has expired and cannot accept transfers.',
        });
      }

      const days = Number(existing.requestedDays) || 30;
      const targetDueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      updated = await prisma.$transaction(async (tx) => {
        // 1. If student has an existing assignment in the source course, expire it
        if (sourceCourseId && sourceCourseId !== targetCourseId) {
          const sourceAssignment = await tx.assignment.findUnique({
            where: {
              userId_moduleId: {
                userId: studentId,
                moduleId: sourceCourseId,
              },
            },
          });
          if (sourceAssignment) {
            await tx.assignment.update({
              where: { id: sourceAssignment.id },
              data: {
                status: 'EXPIRED',
                submissionNotes: `Transferred to course track [${targetModule.code || targetCourseId}] by Admin ${req.user.name || req.user.email}.`,
              },
            });
          }
        }

        // 2. Provision or reactivate target course assignment
        await tx.assignment.upsert({
          where: {
            userId_moduleId: {
              userId: studentId,
              moduleId: targetCourseId,
            },
          },
          update: {
            assignedBy: req.user.id,
            dueDate: targetDueDate,
            status: 'IN_PROGRESS',
          },
          create: {
            userId: studentId,
            moduleId: targetCourseId,
            assignedBy: req.user.id,
            dueDate: targetDueDate,
            progress: 0,
            status: 'IN_PROGRESS',
            completedLessons: '[]',
          },
        });

        // 3. Mark transfer request as APPROVED
        return await tx.transferRequest.update({
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
      });

      cache.invalidatePrefix('modules:');
    } else if (existing.type === 'DEPARTMENT_TRANSFER' && existing.toDepartment) {
      updated = await prisma.$transaction(async (tx) => {
        if (existing.user && existing.user.role !== 'USER') {
          await tx.user.update({
            where: { id: existing.userId },
            data: { department: existing.toDepartment },
          });
        }
        return await tx.transferRequest.update({
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
      });
    } else {
      updated = await prisma.transferRequest.update({
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
    }

    // Create notification for requester
    const recipientId = existing.studentId || existing.userId;
    try {
      if (recipientId) {
        await prisma.notification.create({
          data: {
            recipientId,
            title: 'Request Approved',
            message: `Your ${existing.type.replace(/_/g, ' ').toLowerCase()} request has been approved.`,
            type: 'SYSTEM',
            link: '/courses',
          },
        });
      }
    } catch (notifErr) {
      logger.warn(`Failed to create transfer approval notification: ${notifErr.message}`);
    }

    if (io) {
      if (recipientId) {
        io.to('role_ADMIN').to('role_MODERATOR').to(`user_${recipientId}`).emit('transfer:updated', updated);
        io.to(`user_${recipientId}`).emit('transfer_resolved', {
          transferId: existing.id,
          status: 'APPROVED',
          message: 'Your transfer/extension request has been approved.',
        });
        io.to(`user_${recipientId}`).emit('system_notification', {
          title: 'Request Approved',
          message: `Your ${existing.type.replace(/_/g, ' ').toLowerCase()} request has been approved.`,
          type: 'SYSTEM',
          link: '/courses',
        });
      } else {
        io.to('role_ADMIN').to('role_MODERATOR').emit('transfer:updated', updated);
      }
    }
    cache.invalidatePrefix('admin:');

    return res.status(200).json({
      success: true,
      message: 'Request approved successfully.',
      transfer: updated,
    });
  } catch (error) {
    if (error.code === 'TRANSACTION_UNSUPPORTED' || error.message?.includes('TRANSACTION_UNSUPPORTED')) {
      return res.status(409).json({
        success: false,
        error: 'TRANSACTION_NOT_SUPPORTED',
        message: error.message,
      });
    }
    logger.error('Error in approveTransfer:', error);
    return res.status(500).json({
      success: false,
      error: 'APPROVE_FAILED',
      message: 'Failed to approve request.',
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
    const recipientId = existing.studentId || existing.userId;
    try {
      if (recipientId) {
        await prisma.notification.create({
          data: {
            recipientId,
            title: 'Request Rejected',
            message: `Your ${existing.type.replace(/_/g, ' ').toLowerCase()} request was rejected: ${reason}`,
            type: 'SYSTEM',
            link: '/courses',
          },
        });
      }
    } catch (notifErr) {
      logger.warn(`Failed to create transfer rejection notification: ${notifErr.message}`);
    }

    if (io) {
      if (recipientId) {
        io.to('role_ADMIN').to('role_MODERATOR').to(`user_${recipientId}`).emit('transfer:updated', updated);
        io.to(`user_${recipientId}`).emit('transfer_resolved', {
          transferId: existing.id,
          status: 'REJECTED',
          reason,
          message: `Your transfer/extension request was rejected: ${reason}`,
        });
        io.to(`user_${recipientId}`).emit('system_notification', {
          title: 'Request Rejected',
          message: `Your ${existing.type.replace(/_/g, ' ').toLowerCase()} request was rejected: ${reason}`,
          type: 'SYSTEM',
          link: '/courses',
        });
      } else {
        io.to('role_ADMIN').to('role_MODERATOR').emit('transfer:updated', updated);
      }
    }
    cache.invalidatePrefix('admin:');

    return res.status(200).json({
      success: true,
      message: 'Request rejected.',
      transfer: updated,
    });
  } catch (error) {
    logger.error('Error in rejectTransfer:', error);
    return res.status(500).json({
      success: false,
      error: 'REJECT_FAILED',
      message: 'Failed to reject request.',
    });
  }
}
