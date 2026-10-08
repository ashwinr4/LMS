# QUALIVA FIX REPORT

This report documents the controlled bug fixes applied to the Qualiva LMS codebase addressing the confirmed security, authorization, data isolation, and notification issues identified in the functional audit. All existing workflows, UI behaviors, database schemas, and role hierarchies have been preserved without architectural refactoring.

---

## Issue 1 — Transfer Request Data Leakage

### Problem
When students (`USER` role) requested the list of course transfer and SLA deadline extension requests via `GET /api/v1/transfers`, the query did not scope results by student ID. This caused learners to receive records for all other students across the entire institution.

### Fix
In [`server/src/controllers/transferController.js`](file:///c:/Users/Ashwin/Desktop/LMS/server/src/controllers/transferController.js), added role-based scoping in `listTransfers`. If `req.user.role === 'USER'`, the query and all count aggregates are restricted to `{ studentId: req.user.id }`. In addition, enforced `perms.transfers?.view` for `MODERATOR` users so unauthorized moderators cannot view global transfer logs.

### Workflow Preserved
- Student course transfer submission workflow (`POST /api/v1/transfers`) remains unchanged.
- Student history tab displays their own requests and counts cleanly.
- Administrator global view in `AdminApprovals.jsx` remains unrestricted.
- Authorized Moderator view in `ModeratorTransfers.jsx` continues to display all requests across departments.

### Regression Check
Inspected:
- `client/src/pages/admin/AdminApprovals.jsx` (Transfers tab)
- `client/src/pages/moderator/ModeratorTransfers.jsx`
- `client/src/pages/student/MyCourses.jsx` (Transfer & SLA modal)
Confirmed parameter passing (`status`, `type`, `search`) and response schema `{ success, requests, counts }` remain 100% backward-compatible.

### Status
FIXED

---

## Issue 2 — Transfer Notification & Socket Dispatch Recipient Fix

### Problem
In `approveTransfer` and `rejectTransfer`, notifications and real-time Socket.IO events referenced `existing.userId` instead of `existing.studentId`. Because `userId` is undefined on the `TransferRequest` model, notification creation attempted to write invalid schema fields and emitted socket events to room `user_undefined`, preventing students from receiving transfer resolution alerts.

### Fix
In [`server/src/controllers/transferController.js`](file:///c:/Users/Ashwin/Desktop/LMS/server/src/controllers/transferController.js):
1. Resolved the student recipient ID as `const recipientId = existing.studentId || existing.userId;`.
2. Updated `prisma.notification.create` to store `recipientId` (matching the `Notification` model schema) instead of `userId`.
3. Emitted `transfer:updated`, `transfer_resolved`, and `system_notification` specifically to `user_${recipientId}`.
4. Added listener for `transfer_resolved` in [`client/src/context/SocketContext.jsx`](file:///c:/Users/Ashwin/Desktop/LMS/client/src/context/SocketContext.jsx) to trigger real-time toast alerts.

### Workflow Preserved
- Admin and Moderator approval/rejection workflows in `AdminApprovals.jsx` and `ModeratorTransfers.jsx`.
- SLA deadline extension logic updating `Assignment.dueDate`.
- Staff department reassignment logic.
- Staff audit trail and real-time dashboard counter invalidation.

### Regression Check
Inspected:
- `server/prisma/schema.prisma` (`TransferRequest` and `Notification` models)
- `client/src/context/SocketContext.jsx` (room joining and toast dispatches)
- `server/src/constants/socketEvents.js` and `client/src/constants/socketEvents.js`
Confirmed `transfer_resolved` payload `{ transferId, status, message }` matches the frontend event contract.

### Status
FIXED

---

## Issue 3 — Creator Enrollment Queue Data Isolation

### Problem
In `getCreatorQueue` (`GET /api/v1/enrollments/creator-queue`) and `getCreatorQueueCount`, the queries selected all requests with `status: 'PENDING_CREATOR'` without scoping by course owner. As a result, Course Creators could view and endorse/reject enrollment applications for courses owned by other instructors.

### Fix
In [`server/src/controllers/enrollmentController.js`](file:///c:/Users/Ashwin/Desktop/LMS/server/src/controllers/enrollmentController.js):
1. Scoped `getCreatorQueue` and `getCreatorQueueCount` when `req.user.role === 'COURSE_CREATOR'` to:
   ```javascript
   where.OR = [
     { creatorId: req.user.id },
     { module: { createdBy: req.user.id } },
     { module: { instructorId: req.user.id } },
   ];
   ```
2. Added ownership authorization checks to `forwardToAdmin` and `rejectEnrollment` to reject unauthorized endorsements/rejections with `403 Forbidden` (`FORBIDDEN_OWNERSHIP`).
3. Targeted real-time socket events `creator_new_request` and `creator_request_resolved` to the specific course owner room `user_${targetInstructorId}` rather than broadcasting across all course creators.

### Workflow Preserved
- Student enrollment request pipeline (`requestEnrollment`).
- Creator review and endorsement pipeline (`CreatorRequests.jsx`).
- Admin approval queue (`getAdminQueue`) and final authorization (`approveEnrollment`).
- Real-time queue badge decrements.

### Regression Check
Inspected:
- `client/src/pages/creator/CreatorRequests.jsx`
- `client/src/components/layout/AppShell.jsx` (creator queue count badge)
- `server/src/routes/enrollmentRoutes.js`
Confirmed Admin users continue to have unrestricted access to all queues while Creators only observe their own courses.

### Status
FIXED

---

## Issue 4 — Creator Course & Assessment Ownership Validation

### Problem
Course Creators could update or delete modules, curriculum sections, lessons, and assessments created by other instructors because mutations checked only the generic role `COURSE_CREATOR` rather than verifying resource ownership (`module.createdBy === req.user.id`).

### Fix
1. In [`server/src/controllers/moduleController.js`](file:///c:/Users/Ashwin/Desktop/LMS/server/src/controllers/moduleController.js):
   - In `updateModule` and `deleteModule`, verified `existing.createdBy === req.user.id || existing.instructorId === req.user.id` when caller is `COURSE_CREATOR`.
   - In `createSection`, `updateSection`, and `deleteSection`, verified parent module ownership.
   - In `createLesson`, `updateLesson`, and `deleteLesson`, verified parent module ownership via section hierarchy.
2. In [`server/src/controllers/assessmentController.js`](file:///c:/Users/Ashwin/Desktop/LMS/server/src/controllers/assessmentController.js):
   - In `listAssessments`, restricted results to creator-owned courses when caller is `COURSE_CREATOR`.
   - In `getAssessment`, `createAssessment`, `updateAssessment`, and `deleteAssessment`, verified module ownership before allowing read/write mutations.
3. If ownership check fails for non-admin creators, API responds with `403 Forbidden` and error code `FORBIDDEN_OWNERSHIP`. Administrators continue to bypass ownership checks.

### Workflow Preserved
- Course creation and editing in `CourseStudio.jsx`.
- Curriculum section and lesson reordering, media uploads, and video links.
- Assessment question bank creation, document parsing (`/extract`), and exam editing in `CreatorAssessments.jsx`.
- Student learning progress (`completeLesson`) and exam sessions (`startExam`, `submitExam`).

### Regression Check
Inspected:
- `server/src/routes/moduleRoutes.js`
- `server/src/routes/assessmentRoutes.js`
- `client/src/pages/creator/CourseStudio.jsx`
- `client/src/pages/creator/CreatorAssessments.jsx`
Confirmed no breaking changes to request bodies, response payloads, or UI event handlers.

### Status
FIXED

---

## Issue 5 — Moderator Transfer Permission Enforcement

### Problem
Endpoints `PATCH /api/v1/transfers/:id/approve` and `PATCH /api/v1/transfers/:id/reject` in `transferRoutes.js` used `requireRoles('ADMIN', 'MODERATOR')` without enforcing the granular moderator permission `transfers.approve`. Any moderator could approve or reject student transfers regardless of assigned privileges.

### Fix
In [`server/src/routes/transferRoutes.js`](file:///c:/Users/Ashwin/Desktop/LMS/server/src/routes/transferRoutes.js):
Replaced `requireRoles('ADMIN', 'MODERATOR')` with:
```javascript
requireModeratorPermission('transfers', 'approve')
```
on both the `approve` and `reject` routes.

### Workflow Preserved
- Administrators continue to possess full operational authority without restriction (`requireModeratorPermission` unconditionally passes for `ADMIN`).
- Moderators with `transfers.approve: true` can review and authorize/reject requests.
- Moderators lacking the permission receive `403 Forbidden` (`MODERATOR_PERMISSION_DENIED`).

### Regression Check
Inspected:
- `server/src/middleware/auth.js` (`requireModeratorPermission` logic)
- `client/src/pages/moderator/ModeratorTransfers.jsx` (`perms.transfers?.approve` button conditions)
- `client/src/pages/admin/AdminApprovals.jsx`
Confirmed the permission structure and error format align with existing moderator endpoints in `moderatorRoutes.js`.

### Status
FIXED

---

## Final Summary

- **Confirmed issues fixed**: 5
- **Remaining issues**: 0
- **Files modified**: 6
- **Routes modified**: 1 (`server/src/routes/transferRoutes.js`)
- **Controllers modified**: 4 (`transferController.js`, `enrollmentController.js`, `moduleController.js`, `assessmentController.js`)
- **Middleware modified**: 0 (existing `requireModeratorPermission` reused)
- **Frontend modified**: 1 (`client/src/context/SocketContext.jsx` for real-time transfer resolution listener)

### Runtime Verification Required
The following verifications cannot be proven by code inspection alone and require runtime verification:
1. **Multi-Tab Live Socket Delivery**: Verifying that a student logged into browser Tab A receives the `transfer_resolved` toast notification within 500ms when an Administrator approves a transfer in browser Tab B.
2. **MongoDB / PostgreSQL Dual Adapter Queries**: Verifying that `where.OR` queries with nested module relation filters execute within standard latency on MongoDB via `mongoAdapter.js`.
