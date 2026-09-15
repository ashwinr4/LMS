/**
 * Central Deterministic Hashed Route Map
 * Obfuscates sensitive administrative, creator, and moderation URL paths
 * to prevent route enumeration, shoulder-surfing, and automated bot scraping.
 */

export const ROUTES = {
  // Public Portals
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  VERIFY_CERTIFICATE: '/verify',
  PUBLIC_COURSES: '/courses',

  // Student Portals
  CATALOG: '/catalog',
  MY_COURSES: '/my-courses',
  LEARN: (moduleId) => `/courses/${moduleId}/learn`,
  WAITING_APPROVAL: (moduleId) => `/waiting-approval/${moduleId}`,
  ASSESSMENTS: '/assessments',
  EXAM_ROOM: (examId) => `/assessments/${examId}/room`,
  CERTIFICATES: '/certificates',
  INBOX: '/inbox',
  PROFILE: '/profile',

  // Admin Hashed Portals (Base: /portal/8f9b2c)
  ADMIN_BASE: '/portal/8f9b2c',
  ADMIN_DASHBOARD: '/portal/8f9b2c',
  ADMIN_USERS: '/portal/8f9b2c/u-7e4a',
  ADMIN_USER_DETAIL: (userId) => `/portal/8f9b2c/u-7e4a/${userId}`,
  ADMIN_COURSES: '/portal/8f9b2c/c-3d1f',
  ADMIN_APPROVALS: '/portal/8f9b2c/a-5b2e',
  ADMIN_AUDIT: '/portal/8f9b2c/x-9f8a',
  ADMIN_SETTINGS: '/portal/8f9b2c/s-d41a',

  // Creator Hashed Portals (Base: /workspace/6c30f1)
  CREATOR_BASE: '/workspace/6c30f1',
  CREATOR_DASHBOARD: '/workspace/6c30f1',
  CREATOR_STUDIO: '/workspace/6c30f1/studio',
  CREATOR_COURSES: '/workspace/6c30f1/courses',
  CREATOR_ASSESSMENTS: '/workspace/6c30f1/assessments',
  CREATOR_REQUESTS: '/workspace/6c30f1/requests',

  // Moderator Hashed Portals (Base: /console/9a4e21)
  MODERATOR_BASE: '/console/9a4e21',
  MODERATOR_DASHBOARD: '/console/9a4e21',
  MODERATOR_USERS: '/console/9a4e21/users',
  MODERATOR_USER_DETAIL: (userId) => `/console/9a4e21/users/${userId}`,
  MODERATOR_COURSES: '/console/9a4e21/courses',
  MODERATOR_TRANSFERS: '/console/9a4e21/transfers',
};

// Legacy raw paths for transparent backwards-compatible redirects
export const LEGACY_REDIRECTS = [
  { from: '/admin', to: ROUTES.ADMIN_DASHBOARD },
  { from: '/admin/users', to: ROUTES.ADMIN_USERS },
  { from: '/admin/courses', to: ROUTES.ADMIN_COURSES },
  { from: '/admin/approvals', to: ROUTES.ADMIN_APPROVALS },
  { from: '/admin/audit', to: ROUTES.ADMIN_AUDIT },
  { from: '/admin/audit-logs', to: ROUTES.ADMIN_AUDIT },
  { from: '/admin/settings', to: ROUTES.ADMIN_SETTINGS },
  { from: '/creator', to: ROUTES.CREATOR_DASHBOARD },
  { from: '/creator/studio', to: ROUTES.CREATOR_STUDIO },
  { from: '/creator/courses', to: ROUTES.CREATOR_COURSES },
  { from: '/creator/assessments', to: ROUTES.CREATOR_ASSESSMENTS },
  { from: '/creator/requests', to: ROUTES.CREATOR_REQUESTS },
  { from: '/moderator', to: ROUTES.MODERATOR_DASHBOARD },
  { from: '/moderator/users', to: ROUTES.MODERATOR_USERS },
  { from: '/moderator/courses', to: ROUTES.MODERATOR_COURSES },
  { from: '/moderator/transfers', to: ROUTES.MODERATOR_TRANSFERS },
];
