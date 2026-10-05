/**
 * Qualiva LMS — Canonical Real-Time Socket.IO Event Contracts (Frontend)
 */

export const SOCKET_EVENTS = {
  ADMIN_NEW_REQUEST: 'admin_new_request',
  ADMIN_REQUEST_RESOLVED: 'admin_request_resolved',
  CREATOR_NEW_REQUEST: 'creator_new_request',
  CREATOR_REQUEST_RESOLVED: 'creator_request_resolved',
  ENROLLMENT_STATUS_UPDATED: 'enrollment_status_updated',
  ENROLLMENT_APPROVED: 'enrollment_approved',
  ENROLLMENT_REJECTED: 'enrollment_rejected',
  TRANSFER_CREATED: 'transfer:created',
  TRANSFER_UPDATED: 'transfer:updated',
  TRANSFER_RESOLVED: 'transfer_resolved',
  COURSE_CREATED: 'course_created',
  COURSE_UPDATED: 'course_updated',
  COURSE_DELETED: 'course_deleted',
  CURRICULUM_UPDATED: 'curriculum_updated',
  ASSESSMENT_PUBLISHED: 'assessment_published',
  ASSESSMENT_UPDATED: 'assessment_updated',
  ASSESSMENT_SUBMITTED: 'assessment_submitted',
  ASSESSMENT_GRADED: 'assessment_graded',
  USER_ROLE_UPDATED: 'user_role_updated',
  USER_STATUS_UPDATED: 'user_status_updated',
  USER_STATUS_CHANGED: 'user_status_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',
  SYSTEM_NOTIFICATION: 'system_notification',
  NOTIFICATIONS_READ: 'notifications_read',
  NEW_DIRECT_MESSAGE: 'new_direct_message',
  NEW_COMMUNITY_MESSAGE: 'new_community_message',
  NEW_ANNOUNCEMENT: 'new_announcement',
};
