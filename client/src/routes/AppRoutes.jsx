import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.jsx';
import { PublicLayout } from '../components/layout/PublicLayout.jsx';
import { ProtectedRoute } from './ProtectedRoute.jsx';

// Lightweight, instant Page Loading Fallback
function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] w-full">
      <div className="flex flex-col items-center gap-2">
        <div className="h-6 w-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        <span className="text-xs font-medium text-app-secondary">Loading...</span>
      </div>
    </div>
  );
}

// Lazy-Loaded Public Portals
const Landing = lazy(() => import('../pages/public/Landing.jsx'));
const Login = lazy(() => import('../pages/public/Login.jsx'));
const Register = lazy(() => import('../pages/public/Register.jsx'));
const CertificateVerify = lazy(() => import('../pages/public/CertificateVerify.jsx'));
const NotFound = lazy(() => import('../pages/public/NotFound.jsx'));

// Lazy-Loaded Admin Portals
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard.jsx'));
const AdminApprovals = lazy(() => import('../pages/admin/AdminApprovals.jsx'));
const UserDirectory = lazy(() => import('../pages/admin/UserDirectory.jsx'));
const AdminUserDetail = lazy(() => import('../pages/admin/AdminUserDetail.jsx'));
const CourseManagement = lazy(() => import('../pages/admin/CourseManagement.jsx'));
const AuditLogs = lazy(() => import('../pages/admin/AuditLogs.jsx'));

// Lazy-Loaded Creator Portals
const CreatorDashboard = lazy(() => import('../pages/creator/CreatorDashboard.jsx'));
const CreatorRequests = lazy(() => import('../pages/creator/CreatorRequests.jsx'));
const CreatorAssessments = lazy(() => import('../pages/creator/CreatorAssessments.jsx'));
const CourseStudio = lazy(() => import('../pages/creator/CourseStudio.jsx'));

// Lazy-Loaded Moderator Portals
const ModeratorDashboard = lazy(() => import('../pages/moderator/ModeratorDashboard.jsx'));
const ModeratorUsers = lazy(() => import('../pages/moderator/ModeratorUsers.jsx'));
const ModeratorUserDetail = lazy(() => import('../pages/moderator/ModeratorUserDetail.jsx'));
const ModeratorCourses = lazy(() => import('../pages/moderator/ModeratorCourses.jsx'));
const ModeratorTransfers = lazy(() => import('../pages/moderator/ModeratorTransfers.jsx'));

// Lazy-Loaded Student Portals
const CourseCatalog = lazy(() => import('../pages/student/CourseCatalog.jsx'));
const MyCourses = lazy(() => import('../pages/student/MyCourses.jsx'));
const Assessments = lazy(() => import('../pages/student/Assessments.jsx'));
const ExamRoom = lazy(() => import('../pages/student/ExamRoom.jsx'));
const Certificates = lazy(() => import('../pages/student/Certificates.jsx'));
const LearningPlayer = lazy(() => import('../pages/student/LearningPlayer.jsx'));
const EnrollmentWaitingScreen = lazy(() => import('../pages/student/EnrollmentWaitingScreen.jsx'));

// Lazy-Loaded Common Portals
const Inbox = lazy(() => import('../pages/common/Inbox.jsx'));
const Profile = lazy(() => import('../pages/common/Profile.jsx'));
const AdminSettings = lazy(() => import('../pages/admin/AdminSettings.jsx'));

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
      {/* ═══════════════════════════════════════════════════════ */}
      {/* 1. PUBLIC ROUTES (Standalone Full-Width Public Layout) */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="verify" element={<CertificateVerify />} />
        <Route path="courses" element={<CourseCatalog />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 2. PROTECTED PORTALS (Fixed Deep Navy Enterprise Shell) */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Route element={<AppShell />}>
        {/* Student Protected Routes */}
        <Route
          path="catalog"
          element={
            <ProtectedRoute>
              <CourseCatalog />
            </ProtectedRoute>
          }
        />
        <Route
          path="my-courses"
          element={
            <ProtectedRoute>
              <MyCourses />
            </ProtectedRoute>
          }
        />
        <Route
          path="courses/:moduleId/learn"
          element={
            <ProtectedRoute>
              <LearningPlayer />
            </ProtectedRoute>
          }
        />
        <Route
          path="waiting-approval/:moduleId"
          element={
            <ProtectedRoute>
              <EnrollmentWaitingScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="assessments"
          element={
            <ProtectedRoute>
              <Assessments />
            </ProtectedRoute>
          }
        />
        <Route
          path="assessments/:examId/exam"
          element={
            <ProtectedRoute>
              <ExamRoom />
            </ProtectedRoute>
          }
        />
        <Route
          path="assessments/:examId/room"
          element={
            <ProtectedRoute>
              <ExamRoom />
            </ProtectedRoute>
          }
        />
        <Route
          path="certificates"
          element={
            <ProtectedRoute>
              <Certificates />
            </ProtectedRoute>
          }
        />
        <Route
          path="inbox"
          element={
            <ProtectedRoute>
              <Inbox />
            </ProtectedRoute>
          }
        />
        {/* Universal Profile Route (For ALL Authenticated Users) */}
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* Admin Protected Routes */}
        <Route
          path="admin"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <UserDirectory />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/users/:userId"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminUserDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/courses"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <CourseManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/approvals"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminApprovals />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/audit"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AuditLogs />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/audit-logs"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AuditLogs />
            </ProtectedRoute>
          }
        />
        {/* Admin Infrastructure & Database Settings (ADMIN ONLY) */}
        <Route
          path="admin/settings"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/*"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* Creator Protected Routes */}
        <Route
          path="creator"
          element={
            <ProtectedRoute allowedRoles={['COURSE_CREATOR', 'ADMIN']}>
              <CreatorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="creator/studio"
          element={
            <ProtectedRoute allowedRoles={['COURSE_CREATOR', 'ADMIN']}>
              <CourseStudio />
            </ProtectedRoute>
          }
        />
        <Route
          path="creator/requests"
          element={
            <ProtectedRoute allowedRoles={['COURSE_CREATOR', 'ADMIN']}>
              <CreatorRequests />
            </ProtectedRoute>
          }
        />
        <Route
          path="creator/assessments"
          element={
            <ProtectedRoute allowedRoles={['COURSE_CREATOR', 'ADMIN']}>
              <CreatorAssessments />
            </ProtectedRoute>
          }
        />
        <Route
          path="creator/*"
          element={
            <ProtectedRoute allowedRoles={['COURSE_CREATOR', 'ADMIN']}>
              <CreatorDashboard />
            </ProtectedRoute>
          }
        />

        {/* Moderator Protected Routes */}
        <Route
          path="moderator"
          element={
            <ProtectedRoute allowedRoles={['MODERATOR', 'ADMIN']}>
              <ModeratorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="moderator/users"
          element={
            <ProtectedRoute allowedRoles={['MODERATOR', 'ADMIN']}>
              <ModeratorUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="moderator/users/:userId"
          element={
            <ProtectedRoute allowedRoles={['MODERATOR', 'ADMIN']}>
              <ModeratorUserDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="moderator/courses"
          element={
            <ProtectedRoute allowedRoles={['MODERATOR', 'ADMIN']}>
              <ModeratorCourses />
            </ProtectedRoute>
          }
        />
        <Route
          path="moderator/transfers"
          element={
            <ProtectedRoute allowedRoles={['MODERATOR', 'ADMIN']}>
              <ModeratorTransfers />
            </ProtectedRoute>
          }
        />
        <Route
          path="moderator/*"
          element={
            <ProtectedRoute allowedRoles={['MODERATOR', 'ADMIN']}>
              <ModeratorDashboard />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
    </Suspense>
  );
}
