/**
 * Qualiva LMS — Canonical Real-Time Socket.IO Event Contracts
 *
 * This file serves as the single source of truth for all real-time event names
 * and their documented payload structures across backend controllers and frontend listeners.
 */

export const SOCKET_EVENTS = {
  // ── Administrative & Approvals ──
  ADMIN_NEW_REQUEST: 'admin_new_request',
  // Payload: { requestType: 'MODERATOR_REGISTRATION'|'ENROLLMENT_FORWARDED', user?: object, request?: object, requestId?: string, userId?: string, message?: string }

  ADMIN_REQUEST_RESOLVED: 'admin_request_resolved',
  // Payload: { requestId?: string, userId?: string, type?: 'ENROLLMENT'|'MODERATOR'|'STATUS', status?: string }

  // ── Course Creator Workflow ──
  CREATOR_NEW_REQUEST: 'creator_new_request',
  // Payload: { request: object, message: string }

  CREATOR_REQUEST_RESOLVED: 'creator_request_resolved',
  // Payload: { requestId: string }

  // ── Enrollment Pipeline (Student) ──
  ENROLLMENT_STATUS_UPDATED: 'enrollment_status_updated',
  // Payload: { requestId: string, status: string, message: string }

  ENROLLMENT_APPROVED: 'enrollment_approved',
  // Payload: { requestId: string, moduleId: string, courseId: string, assignmentId: string, message: string }

  ENROLLMENT_REJECTED: 'enrollment_rejected',
  // Payload: { requestId: string, moduleId: string, courseId: string, reason: string, message: string }

  // ── SLA & Course Transfers ──
  TRANSFER_CREATED: 'transfer:created',
  // Payload: formattedTransfer object (delivered to role_ADMIN, role_MODERATOR, and user_<requesterId>)

  TRANSFER_UPDATED: 'transfer:updated',
  // Payload: updatedTransfer object (delivered to role_ADMIN, role_MODERATOR, and user_<requesterId>)

  TRANSFER_RESOLVED: 'transfer_resolved',
  // Payload: { transferId: string, status: 'APPROVED'|'REJECTED', reason?: string, message: string }

  // ── Course Lifecycle & Curriculum ──
  COURSE_CREATED: 'course_created',
  // Payload: { module: object }

  COURSE_UPDATED: 'course_updated',
  // Payload: { moduleId: string, module: object }

  COURSE_DELETED: 'course_deleted',
  // Payload: { moduleId: string }

  CURRICULUM_UPDATED: 'curriculum_updated',
  // Payload: { moduleId: string }

  // ── Assessments & Grading ──
  ASSESSMENT_PUBLISHED: 'assessment_published',
  // Payload: { assessmentId: string, moduleId: string }

  ASSESSMENT_UPDATED: 'assessment_updated',
  // Payload: { assessmentId: string, moduleId: string }

  ASSESSMENT_SUBMITTED: 'assessment_submitted',
  // Payload: { assessmentId: string, studentId: string, studentName?: string, passed: boolean, score: number }

  ASSESSMENT_GRADED: 'assessment_graded',
  // Payload: { assessmentId: string, moduleId: string, score: number, passed: boolean, isDisqualified: boolean }

  // ── Identity, RBAC & Status ──
  USER_ROLE_UPDATED: 'user_role_updated',
  // Payload: { role: string, permissions?: object, status?: string }

  USER_STATUS_UPDATED: 'user_status_updated',
  // Payload: { userId: string, status: string } (Broadcast to role_ADMIN)

  USER_STATUS_CHANGED: 'user_status_changed',
  // Payload: { status: 'ACTIVE'|'LOCKED'|'SUSPENDED' } (Direct to user_<id>)

  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  // Payload: { userId: string, email: string, name: string }

  PASSWORD_RESET_COMPLETED: 'password_reset_completed',
  // Payload: { userId: string }

  // ── System Notifications & Messaging ──
  SYSTEM_NOTIFICATION: 'system_notification',
  // Payload: Notification document

  NOTIFICATIONS_READ: 'notifications_read',
  // Payload: { id?: string, all?: boolean, isRead?: boolean }

  NEW_DIRECT_MESSAGE: 'new_direct_message',
  // Payload: ChatMessage document

  NEW_COMMUNITY_MESSAGE: 'new_community_message',
  // Payload: ChatMessage document

  NEW_ANNOUNCEMENT: 'new_announcement',
  // Payload: ChatMessage document
};
