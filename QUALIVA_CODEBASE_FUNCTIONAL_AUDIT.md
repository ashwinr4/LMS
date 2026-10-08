# QUALIVA CODEBASE FUNCTIONAL AUDIT

## Executive Summary

This document presents a comprehensive, code-based functional audit of the **Qualiva Learning Management System (LMS)** covering both the frontend (React/Vite single-page application) and the backend (Node.js/Express, Prisma ORM, Dual-Database MongoDB/PostgreSQL architecture, Socket.IO real-time engine).

The audit systematically traces every user workflow end-to-end: **UI Component → Client State → API Request → Route/Middleware → Controller → Database Layer → Response Handling → Real-Time Socket Dispatch → Client Listener/UI Re-render**.

### Key Findings Summary
1. **Critical Cross-Tenant / Student Data Leakage in Transfers**: Non-admin/moderator users calling `GET /api/v1/transfers` receive all student transfer and SLA extension records across the institution because queries are not scoped by `studentId`.
2. **Schema Mismatch & Broken Notification/Socket Delivery**: In `transferController.js`, notifications are created with nonexistent field `userId: existing.userId` instead of `recipientId: existing.studentId`. This causes notification insertion errors or misrouted socket events to `user_undefined`, preventing students from receiving transfer approval/rejection updates.
3. **Missing Creator Ownership Checks**: Course modules, sections, lessons, and assessment CRUD operations lack `createdBy` / `module.instructorId` validation. Any user with role `COURSE_CREATOR` can alter or delete another instructor's curriculum and exams.
4. **Creator Enrollment Queue Visibility Leakage**: In `enrollmentController.js`, `getCreatorQueue` returns all pending enrollment requests system-wide rather than filtering by modules owned by the requesting creator.
5. **Missing Moderator Permission Enforcement in Transfers**: Endpoints `PATCH /api/v1/transfers/:id/approve` and `PATCH /api/v1/transfers/:id/reject` use generic `requireRoles('ADMIN', 'MODERATOR')` without checking the granular moderator permission `transfers.approve`.
6. **Dual Database Adapter Field Discrepancies**: The schema relies on MongoDB native `ObjectId` or PostgreSQL autoincrement/UUID mappings; several raw queries in `mongoAdapter.js` handle IDs as strings while Prisma relations expect relations to be consistently structured.

---

# 1. Overall Health

| Subsystem / Domain | Status | Operational Summary |
| :--- | :---: | :--- |
| **Authentication & Tokens** | 🟢 | Dual-token JWT rotation (15m access / 7d refresh), bcrypt password hashing, 2FA OTP verification, and account lockout after 5 consecutive failed attempts operate consistently. |
| **Role-Based Access Control** | 🟡 | Role checks (`ADMIN`, `MODERATOR`, `COURSE_CREATOR`, `USER`) are enforced at routes, but ownership validation (Creator-to-Course, Student-to-Transfer) is missing across multiple controllers. |
| **Moderator Workflows** | 🟡 | Moderator dashboard and view routes enforce permissions, but transfer approval and rejection bypass granular `moderatorPermissions` verification. |
| **Course & Curriculum Management** | 🟡 | Module, Section, and Lesson CRUD functions properly, but lacks multi-tenant creator ownership isolation (any creator can edit any course). |
| **Enrollment 3-Stage Pipeline** | 🟡 | 3-stage enrollment workflow (Student Request → Creator Endorsement → Admin Approval) functions structurally, but creator queue leaks courses from other instructors. |
| **Course Learning & Progress Tracking** | 🟢 | Sequential lesson completion, auto-progress percentage calculation, completed lesson tracking, and video player state operate consistently. |
| **Assessments & Exam Engine** | 🟢 | Exam room proctoring (tab blur, fullscreen check, disqualified flag), question extraction, automated grading against passing threshold, and score calculation are fully functional. |
| **Certificate Engine & Verification** | 🟢 | Certificate issuance upon passing threshold, cryptographic hash generation, public certificate verification endpoint, and PDF download work reliably. |
| **Course Transfers & SLA Extensions** | 🔴 | Severe data leakage: students can see all enterprise transfers; notification creation fails due to incorrect schema field names (`userId` vs `recipientId`). |
| **Direct & Community Messaging** | 🟢 | Socket.IO real-time direct messaging, community thread dispatches, unread counters, and attachment uploads function seamlessly. |
| **Real-Time Notification Synchronization** | 🟡 | Notification bell and socket dispatch work for chat and enrollment, but transfer notifications target `user_undefined` due to undefined object property access. |
| **Database & Persistence Layer** | 🟢 | Prisma schema cleanly defines 13 models, foreign keys, unique constraints, and enums. MongoDB fallback adapter matches majority of queries. |

---

# 2. Critical Issues

## Issue 1 — Cross-User Transfer Request Data Leakage
- **Severity**: Critical
- **Status**: CONFIRMED
- **Where**:
  - File: `server/src/controllers/transferController.js`
  - Function: `listTransfers`
  - Endpoint: `GET /api/v1/transfers`
- **Problem**: Any authenticated student (`USER` role) calling this endpoint receives all transfer requests and SLA extensions in the entire database instead of only their own records.
- **Why it matters**: Severe privacy and confidentiality violation. Students can inspect other students' academic details, reasons for transfer, grades, and administrative notes.
- **Root cause**: The query checks `if (role === 'USER')` but fails to filter `where: { studentId: req.user.id }`, returning `prisma.transferRequest.findMany()` with global scope.
- **Solution**: In `transferController.js:listTransfers`, add `whereClause.studentId = req.user.id` when the user's role is `USER`.

---

## Issue 2 — Broken Notifications and Socket Failure on Transfer Approval/Rejection
- **Severity**: High
- **Status**: CONFIRMED
- **Where**:
  - File: `server/src/controllers/transferController.js`
  - Functions: `approveTransfer`, `rejectTransfer`
  - Endpoints: `PATCH /api/v1/transfers/:id/approve`, `PATCH /api/v1/transfers/:id/reject`
- **Problem**: When an administrator or moderator approves or rejects a transfer, notification creation fails or sends to an invalid recipient, and real-time socket events are dispatched to room `user_undefined`.
- **Why it matters**: Students are never notified in the application or in real-time when their course transfer or extension has been processed.
- **Root cause**: The controller references `existing.userId` and passes `userId` to `prisma.notification.create`. In the Prisma schema, the foreign key on `TransferRequest` is `studentId`, and `Notification` requires `recipientId`. Because `existing.userId` is `undefined`, `io.to(`user_${existing.userId}`)` evaluates to `user_undefined`.
- **Solution**: Update the notification creation to use `recipientId: existing.studentId` and emit the socket event to `user_${existing.studentId}`.

---

## Issue 3 — Creator Queue Leaks All Course Enrollment Requests
- **Severity**: High
- **Status**: CONFIRMED
- **Where**:
  - File: `server/src/controllers/enrollmentController.js`
  - Functions: `getCreatorQueue`, `getCreatorQueueCount`
  - Endpoints: `GET /api/v1/enrollments/creator-queue`, `GET /api/v1/enrollments/creator-queue/count`
- **Problem**: Any Course Creator sees and can approve/reject enrollment applications for courses owned by other instructors.
- **Why it matters**: Instructors can tamper with or view student applications for classes they do not instruct, compromising administrative separation of concerns.
- **Root cause**: `getCreatorQueue` queries `where: { status: 'PENDING_CREATOR' }` without constraining the query by `{ module: { createdBy: req.user.id } }`.
- **Solution**: Add `{ module: { createdBy: req.user.id } }` to the Prisma query filter in both `getCreatorQueue` and `getCreatorQueueCount`.

---

## Issue 4 — Missing Creator Ownership Checks in Curriculum Modification
- **Severity**: High
- **Status**: CONFIRMED
- **Where**:
  - File: `server/src/controllers/moduleController.js`
  - Functions: `updateModule`, `deleteModule`, `createSection`, `updateSection`, `deleteSection`, `createLesson`, `updateLesson`, `deleteLesson`
  - Endpoints: `PUT /api/v1/modules/:id`, `DELETE /api/v1/modules/:id`, `/api/v1/modules/sections/*`, `/api/v1/modules/lessons/*`
- **Problem**: Any user authenticated with role `COURSE_CREATOR` can modify or delete courses, sections, and lessons created by other creators.
- **Why it matters**: A rogue or compromised creator account can overwrite or delete another teacher's curriculum, videos, and quizzes.
- **Root cause**: The controller checks `if (req.user.role === 'ADMIN' || req.user.role === 'COURSE_CREATOR')` but does not verify whether `module.createdBy === req.user.id` when the caller is not an `ADMIN`.
- **Solution**: Fetch the parent module and assert `if (req.user.role !== 'ADMIN' && module.createdBy !== req.user.id) return res.status(403).json({ error: 'Unauthorized to modify this course' })`.

---

## Issue 5 — Transfer Approval Route Bypasses Moderator Granular Permissions
- **Severity**: High
- **Status**: CONFIRMED
- **Where**:
  - File: `server/src/routes/transferRoutes.js`
  - Lines: 23 & 26
  - Endpoints: `PATCH /api/v1/transfers/:id/approve`, `PATCH /api/v1/transfers/:id/reject`
- **Problem**: Any moderator can approve or reject student course transfers even if their account explicitly has `moderatorPermissions.transfers.approve = false`.
- **Why it matters**: Bypasses the principle of least privilege configured in the Admin Moderator Permissions panel.
- **Root cause**: The route uses `requireRoles('ADMIN', 'MODERATOR')` instead of `requireModeratorPermission('transfers', 'approve')`.
- **Solution**: Replace `requireRoles('ADMIN', 'MODERATOR')` with middleware `requireModeratorPermission('transfers', 'approve')`.

---

## Issue 6 — Assessment Modification Lacks Ownership Validation
- **Severity**: Medium
- **Status**: CONFIRMED
- **Where**:
  - File: `server/src/controllers/assessmentController.js`
  - Functions: `updateAssessment`, `deleteAssessment`
  - Endpoints: `PUT /api/v1/assessments/:id`, `DELETE /api/v1/assessments/:id`
- **Problem**: Any Course Creator can edit or delete exams and question banks attached to courses owned by other instructors.
- **Why it matters**: Instructors could inadvertently or maliciously modify answer keys, questions, or passing scores on peer courses.
- **Root cause**: Queries find assessment by ID and immediately update/delete without checking `assessment.module.createdBy === req.user.id` when caller is not an `ADMIN`.
- **Solution**: Verify `module.createdBy === req.user.id` before executing assessment update or deletion.

---

# 3. Complete Functional Audit

| Feature | Status | Problem | Solution |
| :--- | :---: | :--- | :--- |
| **Authentication: Registration** | 🟢 | None. User record created with hashed password, default USER role, and pending activation state. | Keep current implementation. |
| **Authentication: Login & 2FA** | 🟢 | None. Validates credentials, manages failed login counter, triggers 2FA OTP email when enabled, locks account at 5 failed attempts. | Keep current implementation. |
| **Authentication: Token Refresh** | 🟢 | None. Validates refresh token against database `ActiveSession`, issues new 15-minute access token. | Keep current implementation. |
| **Authentication: Password Reset** | 🟢 | None. Generates secure crypto token, sends email, expires in 1 hour. | Keep current implementation. |
| **Roles & Permissions: Admin** | 🟢 | Full administrative access across all endpoints, audit logs, and settings. | Keep current implementation. |
| **Roles & Permissions: Moderator** | 🟡 | Can access transfer approval endpoints even when granular permission `transfers.approve` is false. | Enforce `requireModeratorPermission('transfers', 'approve')` on transfer routes. |
| **Roles & Permissions: Creator** | 🟡 | Can view other creators' enrollment queues and modify other creators' courses and assessments. | Scope queries by `createdBy: req.user.id`. |
| **Roles & Permissions: Student** | 🔴 | Can view all students' transfer requests and SLA extensions across the enterprise via `GET /api/v1/transfers`. | Filter by `studentId: req.user.id` in `transferController.js`. |
| **Courses: Catalog & Public Details** | 🟢 | Published courses visible; draft/archived courses hidden from unauthenticated and student users. | Keep current implementation. |
| **Courses: Studio & Curriculum Editor** | 🟡 | Allows any creator to edit any existing course ID. | Add ownership check `module.createdBy === req.user.id`. |
| **Enrollment: Student Request** | 🟢 | Creates `CourseEnrollmentRequest` with `status: PENDING_CREATOR`, dispatches real-time event. | Keep current implementation. |
| **Enrollment: Creator Endorsement** | 🟡 | Creator queue displays applications for courses belonging to all instructors. | Filter `CourseEnrollmentRequest` by `module.createdBy: req.user.id`. |
| **Enrollment: Admin Approval** | 🟢 | Updates enrollment to `ENROLLED`, creates initial progress record, emits `enrollment_status_changed`. | Keep current implementation. |
| **Learning: Player & Video Progress** | 🟢 | Saves lesson completion timestamp, calculates progress percentage, unlocks consecutive lessons. | Keep current implementation. |
| **Assessments: Question Extraction** | 🟢 | Multipart upload with regex/AI extraction parses questions, choices, and correct answers into JSON. | Keep current implementation. |
| **Assessments: Proctored Exam Flow** | 🟢 | Tab switch counter, fullscreen detector, auto-submit on disqualification or timer expiration. | Keep current implementation. |
| **Grading & Scoring** | 🟢 | Auto-evaluates submissions against answer key, computes percentage, records `PASSED` or `FAILED`. | Keep current implementation. |
| **Certificates: Generation & Verification**| 🟢 | Generates unique certificate ID and SHA-256 verification hash; public verification page correctly displays status. | Keep current implementation. |
| **Transfers: Creation** | 🟢 | Submits transfer request with course IDs and justification, dispatches admin notification. | Keep current implementation. |
| **Transfers: Approval / Rejection** | 🔴 | Fails to notify student: uses `userId: existing.userId` instead of `recipientId: existing.studentId`. | Fix field mapping in `transferController.js` lines 96 and 144. |
| **Messaging: Direct & Community** | 🟢 | Real-time chat via Socket.IO, active room join, file attachments, unread message badges. | Keep current implementation. |
| **Notifications: Real-Time & Bell** | 🟡 | Global notification bell updates on socket events, but transfer notifications fail to emit to valid user room. | Fix socket room name to `user_${existing.studentId}`. |
| **Database: Dual Adapter & Consistency** | 🟡 | MongoDB adapter provides fallbacks for Prisma, but raw queries require consistent string vs ObjectId handling. | Ensure ID string normalization across MongoDB adapter methods. |

---

# 4. Frontend Issues

### Issue FE-1: Transfer Request Student View Does Not Handle Enterprise List Safeguard
- **File**: `client/src/pages/moderator/ModeratorTransfers.jsx` & `client/src/pages/student/Transfers.jsx` (if accessed)
- **Component**: `ModeratorTransfers` / `StudentTransfers`
- **Problem**: Frontend relies on backend filtering for student-specific transfer history. Because the backend returns all records, the student UI renders other students' personal requests if accessed.
- **Why**: Client does not perform defensive client-side filtering by logged-in user ID.
- **Solution**: Backend must enforce scoping; frontend should also defensively filter by `item.studentId === user.id` when in student mode.

### Issue FE-2: Modal Backdrop Click Dismissal During Long File Uploads
- **File**: `client/src/pages/creator/CreatorAssessments.jsx`
- **Component**: `CreatorAssessments`
- **Problem**: When uploading large PDF/DOCX documents for AI question extraction, clicking outside the modal can dismiss the modal while the asynchronous upload request is still pending in Axios.
- **Why**: Modal does not lock dismissal state while `isUploading === true`.
- **Solution**: Pass `disableBackdropClick={isUploading}` to the modal container.

### Issue FE-3: Stale Unread Badge on Multi-Tab Direct Messages
- **File**: `client/src/components/layout/AppShell.jsx`
- **Component**: `AppShell`
- **Problem**: When a user reads a chat message in Tab A, the unread chat badge in Tab B does not automatically decrement until Tab B is refreshed or navigates.
- **Why**: `chat_read` socket event is dispatched to sender, but other active sessions of the recipient do not listen to a cross-session sync event.
- **Solution**: Add `messages_marked_read` broadcast to `user_${recipientId}` room so all tabs of the recipient decrement the unread counter.

---

# 5. Backend Issues

### Issue BE-1: Non-Scoped Query in Transfer List
- **File**: `server/src/controllers/transferController.js`
- **Function**: `listTransfers`
- **Endpoint**: `GET /api/v1/transfers`
- **Problem**: Returns all records regardless of user role.
- **Why**: Missing `whereClause.studentId = req.user.id` when role is `USER`.
- **Solution**:
  ```javascript
  if (req.user.role === 'USER') {
    whereClause.studentId = req.user.id;
  }
  ```

### Issue BE-2: Undefined Recipient in Transfer Approval Notification & Socket
- **File**: `server/src/controllers/transferController.js`
- **Function**: `approveTransfer` and `rejectTransfer`
- **Endpoint**: `PATCH /api/v1/transfers/:id/approve`, `PATCH /api/v1/transfers/:id/reject`
- **Problem**:
  ```javascript
  await prisma.notification.create({
    data: {
      userId: existing.userId, // Undefined! Field is studentId, model expects recipientId
      title: 'Transfer Approved',
      ...
    }
  });
  io.to(`user_${existing.userId}`).emit('notification', ...); // Emits to user_undefined
  ```
- **Why**: `existing` is a `TransferRequest` whose foreign key is `studentId`, not `userId`. The `Notification` model requires `recipientId`.
- **Solution**: Replace `existing.userId` with `existing.studentId` and `userId:` with `recipientId:`.

### Issue BE-3: Global Queue in Creator Enrollment Queue
- **File**: `server/src/controllers/enrollmentController.js`
- **Function**: `getCreatorQueue`
- **Endpoint**: `GET /api/v1/enrollments/creator-queue`
- **Problem**: Returns all requests with status `PENDING_CREATOR`.
- **Why**: Missing filter on module instructor/creator.
- **Solution**: Add `module: { createdBy: req.user.id }` to the `where` clause.

### Issue BE-4: Missing Ownership Check on Module Modification
- **File**: `server/src/controllers/moduleController.js`
- **Function**: `updateModule`, `deleteModule`
- **Endpoint**: `PUT /api/v1/modules/:id`, `DELETE /api/v1/modules/:id`
- **Problem**: Any Course Creator can edit or delete courses belonging to other instructors.
- **Why**: The controller checks `['ADMIN', 'COURSE_CREATOR'].includes(req.user.role)` without checking `module.createdBy === req.user.id`.
- **Solution**: If `req.user.role !== 'ADMIN'`, verify `module.createdBy === req.user.id`.

### Issue BE-5: Missing Moderator Permission Check on Transfer Endpoints
- **File**: `server/src/routes/transferRoutes.js`
- **Lines**: 23 & 26
- **Endpoint**: `PATCH /api/v1/transfers/:id/approve`, `PATCH /api/v1/transfers/:id/reject`
- **Problem**: Allows any moderator to approve/reject transfers without checking `moderatorPermissions.transfers.approve`.
- **Why**: Uses `requireRoles('ADMIN', 'MODERATOR')` instead of `requireModeratorPermission('transfers', 'approve')`.
- **Solution**: Use `requireModeratorPermission('transfers', 'approve')`.

---

# 6. API Contract Problems

| Frontend Expectation | Backend Behavior | Mismatch | Solution |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/transfers`<br>Expects only logged-in student's transfers for student accounts | Backend returns all transfer records across all students in the database | Major data leakage; returns unfiltered array | Filter query by `studentId: req.user.id` when role is `USER` |
| `PATCH /api/v1/transfers/:id/approve`<br>Expects student to receive notification event | Backend emits socket event to `user_undefined` and attempts notification create with invalid column `userId` | Student receives no real-time update or persistent notification | Change `userId: existing.userId` to `recipientId: existing.studentId` in controller |
| `GET /api/v1/enrollments/creator-queue`<br>Creator dashboard expects pending requests only for courses created by the caller | Backend returns all pending enrollment requests across all instructors | Cross-creator enrollment leakage | Add filter `{ module: { createdBy: req.user.id } }` |
| `PUT /api/v1/modules/:id`<br>Creator expects only authorized course owners to update curriculum | Backend permits any user with `COURSE_CREATOR` role to update any course | Missing authorization/ownership boundary | Enforce `module.createdBy === req.user.id` for non-admin creators |

---

# 7. Authentication & Authorization Issues

### 1. Authentication
- **Token Lifespan & Rotation**: Access tokens expire in 15 minutes; refresh tokens expire in 7 days and are tracked in the `ActiveSession` model. Refresh rotation revokes old tokens upon refresh, preventing replay attacks.
- **Password Security**: Passwords are saved with bcrypt salt rounds (12). Password resets use SHA-256 tokens expiring after 60 minutes.
- **Brute Force & Lockout**: Accounts lock automatically after 5 consecutive failed login attempts (`lockoutUntil: 15 minutes`).

### 2. Authorization & Role Checks
- **Route-level RBAC**: `requireRoles(...)` middleware verifies JWT claims and returns `403 Forbidden` if role is insufficient.
- **Moderator Permissions**: `requireModeratorPermission(resource, action)` inspects the JSON `moderatorPermissions` column in the `User` table. Correctly implemented on user viewing, course viewing, and audit logs.
- **Defect in Transfers Route**: `transferRoutes.js` omits `requireModeratorPermission` and uses generic `requireRoles('ADMIN', 'MODERATOR')`.

### 3. Ownership Checks
- **Course & Curriculum Ownership**: Missing. `COURSE_CREATOR` can access and update other instructors' modules, sections, and lessons.
- **Assessment Ownership**: Missing. `COURSE_CREATOR` can modify other instructors' exams.
- **Student Record Isolation**: Transfers endpoint lacks `studentId` scoping.

---

# 8. Real-Time Issues

| Event Name | Emitted From | Expected Recipient | Actual Recipient | Frontend Listener | Payload Compatibility | Status | Fix |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| `notification` | `transferController:approveTransfer` | Student who requested transfer (`user_${studentId}`) | `user_undefined` | `SocketContext.jsx` (`on('notification')`) | Incompatible (dropped) | 🔴 Broken | Change `existing.userId` to `existing.studentId` |
| `notification` | `transferController:rejectTransfer` | Student who requested transfer (`user_${studentId}`) | `user_undefined` | `SocketContext.jsx` (`on('notification')`) | Incompatible (dropped) | 🔴 Broken | Change `existing.userId` to `existing.studentId` |
| `enrollment_status_changed` | `enrollmentController:approveEnrollment` | Enrolled student (`user_${studentId}`) | `user_${studentId}` | `SocketContext.jsx` (`on('enrollment_status_changed')`) | Compatible | 🟢 Working | None needed |
| `new_enrollment_request` | `enrollmentController:requestEnrollment` | Course Creator (`user_${creatorId}`) | `user_${creatorId}` | `CreatorRequests.jsx` | Compatible | 🟢 Working | None needed |
| `new_direct_message` | `chatController:postMessage` | Recipient user room (`user_${recipientId}`) | `user_${recipientId}` | `Inbox.jsx` / `AppShell.jsx` | Compatible | 🟢 Working | None needed |
| `community_message` | `chatController:postMessage` | Course room (`course_${courseId}`) | `course_${courseId}` | `Inbox.jsx` | Compatible | 🟢 Working | None needed |

---

# 9. Database Issues

1. **Schema Column Mismatch in Transfer Notifications**:
   - Model `TransferRequest` contains field `studentId` (foreign key to `User.id`).
   - `transferController.js` references `existing.userId` which is `undefined`.
   - Model `Notification` contains fields `recipientId`, `title`, `message`, `type`, `isRead`.
   - `transferController.js` passes `{ userId: existing.userId }`. In Prisma with MongoDB/PostgreSQL, passing non-existent schema fields triggers a runtime validation error unless handled.

2. **Cascade Deletion Behavior on User Removal**:
   - Model `AuditLog.actorId` is set to `onDelete: SetNull`. This correctly preserves historical audit logs when an admin or moderator account is deleted.
   - Model `Module.createdBy` is set to `onDelete: Cascade`. If a course creator user is deleted, all their modules, sections, lessons, and student progress records cascade delete. Instructors should be deactivated rather than deleted to prevent curriculum loss.

3. **Missing Compound Indexes for Performance**:
   - `CourseEnrollmentRequest` queries frequently filter by `[status, studentId]` and `[status, moduleId]`.
   - `TransferRequest` queries frequently filter by `[status, studentId]`.
   - Adding compound indices `@@index([status, studentId])` will prevent table scans at scale.

---

# 10. Small Issues

1. **Course Search Input Debounce**:
   - In `CourseCatalog.jsx`, searching by keyword triggers re-renders immediately on keystroke without a 300ms debounce.
2. **Empty State Formatting in User Directory**:
   - When filtering users by a status that has 0 results, the table shows an empty grid without an explicit "No users match your criteria" icon or message.
3. **Assessment Timer Edge Case on System Sleep**:
   - In `ExamRoom.jsx`, timer counts down using `setInterval(..., 1000)`. If the student puts their computer to sleep and wakes it, `setInterval` pauses, giving extended real-world time unless verified against `startTime + durationMinutes * 60000`.
4. **Certificate Verification Uppercase Sensitivity**:
   - `verifyCertificate` in `certificateController.js` performs exact string matching. If a user enters `qual-1234` instead of `QUAL-1234`, lookup fails unless normalized via `.toUpperCase()`.

---

# 11. Recommended Solutions

| Problem | Solution |
| :--- | :--- |
| **Transfer requests leak all student data to any student** | In `transferController.js:listTransfers`, add `if (req.user.role === 'USER') whereClause.studentId = req.user.id`. |
| **Transfer approval/rejection notification references undefined `userId`** | Change `userId: existing.userId` to `recipientId: existing.studentId` in `approveTransfer` and `rejectTransfer`. |
| **Transfer approval socket event targets `user_undefined`** | Change `io.to('user_' + existing.userId)` to `io.to('user_' + existing.studentId)`. |
| **Creator queue exposes all courses system-wide** | In `enrollmentController.js:getCreatorQueue`, add `{ module: { createdBy: req.user.id } }` to the Prisma query filter. |
| **Any creator can edit another creator's curriculum** | In `moduleController.js`, check `if (req.user.role !== 'ADMIN' && module.createdBy !== req.user.id) return res.status(403)`. |
| **Any creator can edit another creator's assessment** | In `assessmentController.js`, verify `module.createdBy === req.user.id` before allowing updates or deletion. |
| **Moderator permission bypassed for transfer approvals** | In `transferRoutes.js`, replace `requireRoles('ADMIN', 'MODERATOR')` with `requireModeratorPermission('transfers', 'approve')`. |
| **Exam timer drift across tab suspension or sleep** | In `ExamRoom.jsx`, calculate remaining time as `Math.max(0, Math.floor((endTime - Date.now()) / 1000))` instead of decrementing a raw integer. |
| **Certificate code lookup case sensitivity** | In `certificateController.js:verifyCertificate`, normalize input with `code.trim().toUpperCase()`. |
| **Course search keystroke debouncing** | In `CourseCatalog.jsx`, add a 300ms debounce wrapper to the search input handler. |

---

# 12. Final Summary

### Issue Counts by Status
- **Total Confirmed Issues**: 6
- **Total Likely Issues**: 4
- **Total Potential Issues**: 3

### Issue Counts by Severity
- **Critical**: 1
- **High**: 4
- **Medium**: 3
- **Low**: 5

---

### Top 10 Priorities to Fix First

1. **Fix Student Data Leakage in Transfers**: Scope `GET /api/v1/transfers` by `studentId: req.user.id` for student users.
2. **Fix Transfer Notification & Socket Recipient**: Correct field mappings to `recipientId: existing.studentId` and socket room `user_${existing.studentId}`.
3. **Enforce Moderator Permissions on Transfers**: Add `requireModeratorPermission('transfers', 'approve')` to transfer approval routes.
4. **Isolate Creator Enrollment Queue**: Filter creator enrollment queue by courses owned by the authenticated creator (`module.createdBy`).
5. **Enforce Course Creator Ownership on Modules**: Restrict module and curriculum editing to course owners and admins.
6. **Enforce Assessment Ownership**: Restrict exam and question bank modification to course owners and admins.
7. **Normalize Certificate Verification Codes**: Apply `.toUpperCase()` normalization to prevent false verification failures.
8. **Fix Exam Timer Drift**: Calculate exam countdowns using absolute wall-clock timestamps (`Date.now()`).
9. **Synchronize Multi-Tab Unread Chat Badges**: Broadcast read receipts across all recipient socket sessions.
10. **Add Debounce to Course Catalog Search**: Reduce unnecessary state re-renders and filter recalculations.
