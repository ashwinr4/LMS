import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { io } from '../server.js';

// ============================================================
// STAGE 1: SUBMIT ENROLLMENT APPLICATION (Student)
// ============================================================
export async function requestEnrollment(req, res) {
  try {
    const studentId = req.user.id;
    const { moduleId, studentReason, urgency = 'Normal' } = req.body;

    if (!moduleId) {
      return res.status(400).json({ success: false, message: 'Module ID is required.' });
    }

    // Check if module exists
    const module = await prisma.module.findUnique({
      where: { id: moduleId },
    });

    if (!module) {
      return res.status(404).json({ success: false, message: 'Course module not found.' });
    }

    // Check if user is already enrolled with an active assignment
    const existingAssignment = await prisma.assignment.findUnique({
      where: { userId_moduleId: { userId: studentId, moduleId } },
    });

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'You are already enrolled in this course.',
        assignment: existingAssignment,
      });
    }

    // Check if there is already a pending enrollment request
    const existingRequest = await prisma.courseEnrollmentRequest.findFirst({
      where: {
        studentId,
        moduleId,
        status: { in: ['PENDING_CREATOR', 'FORWARDED_TO_ADMIN'] },
      },
    });

    if (existingRequest) {
      return res.status(200).json({
        success: true,
        message: 'Application is already under review.',
        request: existingRequest,
      });
    }

    // Create Enrollment Request
    const request = await prisma.courseEnrollmentRequest.create({
      data: {
        studentId,
        moduleId,
        creatorId: module.instructorId || module.createdBy,
        status: 'PENDING_CREATOR',
        studentReason: studentReason || 'Requesting course enrollment for professional skill development.',
      },
      include: {
        student: { select: { id: true, name: true, email: true, department: true, avatar: true } },
        module: { select: { id: true, code: true, title: true, level: true, department: true } },
      },
    });

    // Create In-App Notification for Course Creators
    try {
      await prisma.notification.create({
        data: {
          targetRole: 'COURSE_CREATOR',
          title: 'New Student Enrollment Request',
          message: `${req.user.name} (${req.user.department}) applied for ${module.title}.`,
          type: 'ENROLLMENT_REQUEST',
          link: '/creator/requests',
          metadata: JSON.stringify({ requestId: request.id, moduleId }),
        },
      });
    } catch (notifErr) {
      logger.warn(`Failed to create notification record: ${notifErr.message}`);
    }

    // Broadcast WebSocket event to Creator Room and Creator User
    if (io) {
      io.to('role_COURSE_CREATOR').emit('creator_new_request', {
        request,
        message: `New enrollment request from ${req.user.name} for ${module.title}`,
      });
      io.to('role_COURSE_CREATOR').emit('system_notification', {
        title: 'New Student Enrollment Request',
        message: `${req.user.name} (${req.user.department || 'Member'}) applied for ${module.title}.`,
        type: 'ENROLLMENT_REQUEST',
        link: '/creator/requests',
      });
      if (module.instructorId) {
        io.to(`user_${module.instructorId}`).emit('creator_new_request', {
          request,
          message: `New enrollment request from ${req.user.name} for ${module.title}`,
        });
        io.to(`user_${module.instructorId}`).emit('system_notification', {
          title: 'New Student Enrollment Request',
          message: `${req.user.name} applied for your course: ${module.title}.`,
          type: 'ENROLLMENT_REQUEST',
          link: '/creator/requests',
        });
      }
    }

    logger.info(`Enrollment Request [${request.id}] created by Student [${studentId}] for Module [${moduleId}]`);

    return res.status(201).json({
      success: true,
      message: 'Enrollment application submitted successfully. Awaiting Instructor review.',
      request,
    });
  } catch (error) {
    logger.error(`Request Enrollment Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to submit enrollment request.' });
  }
}

// ============================================================
// STAGE 2: CREATOR ENDORSEMENT & FORWARD TO ADMIN (Creator)
// ============================================================
export async function forwardToAdmin(req, res) {
  try {
    const { id } = req.params;
    const { creatorRecommendation = 'Verified and endorsed for administrative provisioning.' } = req.body;

    const request = await prisma.courseEnrollmentRequest.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, name: true, email: true, department: true } },
        module: { select: { id: true, code: true, title: true } },
      },
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Enrollment request not found.' });
    }

    if (request.status !== 'PENDING_CREATOR') {
      return res.status(400).json({
        success: false,
        message: `Request is already in state: ${request.status}`,
      });
    }

    const updated = await prisma.courseEnrollmentRequest.update({
      where: { id },
      data: {
        status: 'FORWARDED_TO_ADMIN',
        creatorRecommendation,
        reviewedByCreatorAt: new Date(),
      },
      include: {
        student: { select: { id: true, name: true, email: true, department: true, avatar: true } },
        module: { select: { id: true, code: true, title: true, level: true, department: true } },
      },
    });

    // Create In-App Notification for Admins
    try {
      await prisma.notification.create({
        data: {
          targetRole: 'ADMIN',
          title: 'Enrollment Application Endorsed',
          message: `Instructor endorsed ${updated.student.name} for ${updated.module.title}. Final approval required.`,
          type: 'ENROLLMENT_REQUEST',
          link: '/admin/approvals?tab=enrollments',
          metadata: JSON.stringify({ requestId: updated.id, moduleId: updated.moduleId }),
        },
      });
    } catch (notifErr) {
      logger.warn(`Failed to create notification record: ${notifErr.message}`);
    }

    // Broadcast WebSocket events
    if (io) {
      // Notify Admins
      io.to('role_ADMIN').emit('admin_new_request', {
        request: updated,
        message: `Instructor endorsed ${updated.student.name} for ${updated.module.title}`,
      });
      io.to('role_ADMIN').emit('system_notification', {
        title: 'Enrollment Application Endorsed',
        message: `Instructor endorsed ${updated.student.name} for ${updated.module.title}. Final approval required.`,
        type: 'ENROLLMENT_REQUEST',
        link: '/admin/approvals?tab=enrollments',
      });

      // Decrement Creator Queue
      io.to('role_COURSE_CREATOR').emit('creator_request_resolved', {
        requestId: updated.id,
      });

      // Update Student Live Waiting Room
      io.to(`user_${updated.studentId}`).emit('enrollment_status_updated', {
        requestId: updated.id,
        status: 'FORWARDED_TO_ADMIN',
        message: 'Your application has been endorsed by the Instructor and forwarded to Admin for final authorization.',
      });
      io.to(`user_${updated.studentId}`).emit('system_notification', {
        title: 'Application Progress Update',
        message: `Your application for ${updated.module.title} has been endorsed by the Instructor and forwarded to Admin.`,
        type: 'APPROVAL',
        link: '/courses',
      });
    }

    logger.info(`Enrollment Request [${id}] forwarded to Admin by Creator [${req.user.id}]`);

    return res.status(200).json({
      success: true,
      message: 'Request successfully endorsed and forwarded to Administrator.',
      request: updated,
    });
  } catch (error) {
    logger.error(`Forward To Admin Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to forward request.' });
  }
}

// ============================================================
// STAGE 3: ADMIN FINAL APPROVAL & PROVISIONING (Admin)
// ============================================================
export async function approveEnrollment(req, res) {
  try {
    const { id } = req.params;
    const { adminNotes = 'Approved for enterprise curriculum track.', dueDateDays = 14 } = req.body;

    const request = await prisma.courseEnrollmentRequest.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, name: true, email: true, department: true } },
        module: { select: { id: true, code: true, title: true } },
      },
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Enrollment request not found.' });
    }

    if (request.status === 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Request is already approved.' });
    }

    const dueDate = new Date(Date.now() + Number(dueDateDays) * 24 * 60 * 60 * 1000);

    // 1. Update Request
    const updated = await prisma.courseEnrollmentRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        adminNotes,
        assignedDueDate: dueDate,
        reviewedByAdminAt: new Date(),
      },
      include: {
        student: { select: { id: true, name: true, email: true, department: true, avatar: true } },
        module: { select: { id: true, code: true, title: true, level: true, department: true } },
      },
    });

    // 2. Provision / Upsert Assignment for Student
    const assignment = await prisma.assignment.upsert({
      where: {
        userId_moduleId: {
          userId: request.studentId,
          moduleId: request.moduleId,
        },
      },
      update: {
        assignedBy: req.user.id,
        dueDate,
        status: 'IN_PROGRESS',
      },
      create: {
        userId: request.studentId,
        moduleId: request.moduleId,
        assignedBy: req.user.id,
        dueDate,
        progress: 0,
        status: 'IN_PROGRESS',
        completedLessons: '[]',
      },
    });

    // 3. Create Student Notification
    try {
      await prisma.notification.create({
        data: {
          recipientId: request.studentId,
          title: 'Course Enrollment Approved!',
          message: `Your enrollment for ${request.module.title} has been authorized. You have ${dueDateDays} days to complete the curriculum.`,
          type: 'APPROVAL',
          link: `/courses/${request.moduleId}/learn`,
          metadata: JSON.stringify({ assignmentId: assignment.id, moduleId: request.moduleId }),
        },
      });
    } catch (notifErr) {
      logger.warn(`Failed to create notification record: ${notifErr.message}`);
    }

    // 4. Emit Real-Time WebSocket event to Student Room
    if (io) {
      io.to(`user_${request.studentId}`).emit('enrollment_approved', {
        requestId: request.id,
        moduleId: request.moduleId,
        moduleCode: request.module.code,
        moduleTitle: request.module.title,
        dueDate: dueDate.toISOString(),
        assignmentId: assignment.id,
        message: `Congratulations! Your enrollment in ${request.module.title} is now active.`,
      });
      io.to(`user_${request.studentId}`).emit('system_notification', {
        title: '🎉 Course Enrollment Approved!',
        message: `Your enrollment for ${request.module.title} has been authorized. You have ${dueDateDays} days to complete the curriculum.`,
        type: 'APPROVAL',
        link: `/courses/${request.moduleId}/learn`,
      });

      // Synchronize Admin Queue Badge
      io.to('role_ADMIN').emit('admin_request_resolved', { requestId: request.id });
    }

    logger.info(`Enrollment Request [${id}] APPROVED by Admin [${req.user.id}]. Assignment [${assignment.id}] provisioned.`);

    return res.status(200).json({
      success: true,
      message: 'Enrollment authorized and course assignment provisioned.',
      request: updated,
      assignment,
    });
  } catch (error) {
    logger.error(`Approve Enrollment Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to approve enrollment.' });
  }
}

// ============================================================
// REJECT ENROLLMENT APPLICATION (Creator or Admin)
// ============================================================
export async function rejectEnrollment(req, res) {
  try {
    const { id } = req.params;
    const { rejectionReason = 'Application requirements were not met at this time.' } = req.body;

    const request = await prisma.courseEnrollmentRequest.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, name: true, email: true } },
        module: { select: { id: true, title: true } },
      },
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Enrollment request not found.' });
    }

    const updated = await prisma.courseEnrollmentRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        adminNotes: rejectionReason,
      },
      include: {
        student: { select: { id: true, name: true, email: true } },
        module: { select: { id: true, code: true, title: true } },
      },
    });

    // Notify student
    try {
      await prisma.notification.create({
        data: {
          recipientId: request.studentId,
          title: 'Enrollment Application Update',
          message: `Your application for ${request.module.title} was declined: ${rejectionReason}`,
          type: 'SYSTEM',
          link: '/courses',
        },
      });
    } catch (notifErr) {
      logger.warn(`Failed to create notification record: ${notifErr.message}`);
    }

    if (io) {
      io.to(`user_${request.studentId}`).emit('enrollment_rejected', {
        requestId: request.id,
        moduleId: request.moduleId,
        moduleTitle: request.module.title,
        reason: rejectionReason,
      });

      // Synchronize Queue Badges
      if (req.user.role === 'ADMIN') {
        io.to('role_ADMIN').emit('admin_request_resolved', { requestId: request.id });
      } else {
        io.to('role_COURSE_CREATOR').emit('creator_request_resolved', { requestId: request.id });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Application rejected.',
      request: updated,
    });
  } catch (error) {
    logger.error(`Reject Enrollment Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to reject enrollment.' });
  }
}

// ============================================================
// GET CREATOR PENDING QUEUE
// ============================================================
export async function getCreatorQueue(req, res) {
  try {
    const requests = await prisma.courseEnrollmentRequest.findMany({
      where: { status: 'PENDING_CREATOR' },
      include: {
        student: { select: { id: true, name: true, email: true, department: true, avatar: true } },
        module: { select: { id: true, code: true, title: true, level: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      requests,
      count: requests.length,
    });
  } catch (error) {
    logger.error(`Get Creator Queue Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch creator review queue.' });
  }
}

// ============================================================
// GET ADMIN APPROVALS QUEUE
// ============================================================
export async function getAdminQueue(req, res) {
  try {
    const { status = 'FORWARDED_TO_ADMIN' } = req.query;
    const where = status === 'ALL' ? {} : { status };

    const requests = await prisma.courseEnrollmentRequest.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, email: true, department: true, avatar: true } },
        module: { select: { id: true, code: true, title: true, level: true, department: true, duration: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      requests,
      count: requests.length,
    });
  } catch (error) {
    logger.error(`Get Admin Queue Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch admin approvals queue.' });
  }
}

// ============================================================
// GET STUDENT'S ENROLLMENT STATUS FOR A MODULE
// ============================================================
export async function getModuleEnrollmentStatus(req, res) {
  try {
    const { moduleId } = req.params;
    const studentId = req.user.id;

    // 1. Check active assignment first
    const assignment = await prisma.assignment.findUnique({
      where: { userId_moduleId: { userId: studentId, moduleId } },
    });

    if (assignment) {
      return res.status(200).json({
        success: true,
        enrolled: true,
        status: 'ENROLLED',
        assignment,
      });
    }

    // 2. Check pending or recent request
    const request = await prisma.courseEnrollmentRequest.findFirst({
      where: { studentId, moduleId },
      orderBy: { createdAt: 'desc' },
      include: {
        module: { select: { id: true, code: true, title: true } },
      },
    });

    return res.status(200).json({
      success: true,
      enrolled: false,
      status: request ? request.status : 'NOT_ENROLLED',
      request: request || null,
    });
  } catch (error) {
    logger.error(`Get Module Enrollment Status Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch enrollment status.' });
  }
}

// ============================================================
// GET MY SUBMITTED REQUESTS (Student)
// ============================================================
export async function getMyRequests(req, res) {
  try {
    const studentId = req.user.id;
    const requests = await prisma.courseEnrollmentRequest.findMany({
      where: { studentId },
      include: {
        module: { select: { id: true, code: true, title: true, department: true, level: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      requests,
    });
  } catch (error) {
    logger.error(`Get My Requests Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch enrollment requests.' });
  }
}

/**
 * GET /api/v1/enrollments/creator-queue-count
 * Fast indexed count of pending creator review requests
 */
export async function getCreatorQueueCount(req, res) {
  try {
    const count = await prisma.courseEnrollmentRequest.count({
      where: { status: 'PENDING_CREATOR' },
    });
    return res.status(200).json({ success: true, count });
  } catch (error) {
    logger.error(`Get Creator Queue Count Error: ${error.message}`);
    return res.status(500).json({ success: false, count: 0 });
  }
}

