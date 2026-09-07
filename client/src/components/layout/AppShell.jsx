import { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { StatusBadge } from '../ui/StatusBadge.jsx';
import { cn } from '../../utils/cn.js';
import { api } from '../../services/api.js';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CheckSquare,
  ShieldAlert,
  FileCheck2,
  GraduationCap,
  Award,
  Layers,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  ChevronDown,
  UserCheck,
  Building2,
  Sparkles,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Mail,
  User,
  Settings,
} from 'lucide-react';

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [passwordResetRequestsCount, setPasswordResetRequestsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [notifications, setNotifications] = useState([]);

  const userRole = user?.role || 'USER';
  const unreadNotificationsCount = notifications.filter((n) => !n.isRead).length;

  // Initial fetch for badges, unread message badges, and system notifications
  useEffect(() => {
    let mounted = true;
    async function fetchInitialData() {
      try {
        // 1. Role-specific queue counts via fast SQL COUNT queries
        if (userRole === 'ADMIN') {
          const badgeRes = await api.get('/admin/badge-counts').catch(() => ({ data: { counts: {} } }));
          if (mounted && badgeRes.data?.counts) {
            setPendingRequestsCount(badgeRes.data.counts.pendingApprovals || 0);
            setPasswordResetRequestsCount(badgeRes.data.counts.passwordResetRequests || 0);
          }
        } else if (userRole === 'COURSE_CREATOR') {
          const creatorRes = await api.get('/enrollments/creator-queue-count').catch(() => ({ data: { count: 0 } }));
          if (mounted && creatorRes.data) {
            setPendingRequestsCount(creatorRes.data.count || 0);
          }
        }

        // 2. Unread direct messages & announcements for Mail icon
        if (location.pathname === '/inbox') {
          await api.post('/chat/read-announcements').catch(() => {});
          if (mounted) setUnreadMessagesCount(0);
        } else {
          const msgRes = await api.get('/chat/unread-count').catch(() => ({ data: { count: 0 } }));
          if (mounted && msgRes.data) {
            setUnreadMessagesCount(msgRes.data.count || 0);
          }
        }

        // 3. System notifications for Bell icon (Option A)
        const notifRes = await api.get('/notifications').catch(() => ({ data: { notifications: [] } }));
        if (mounted && notifRes.data?.notifications) {
          setNotifications(notifRes.data.notifications);
        }
      } catch {
        // silent fail
      }
    }
    fetchInitialData();
    return () => { mounted = false; };
  }, [userRole]);

  // Handle route change for /inbox specifically
  useEffect(() => {
    if (location.pathname === '/inbox') {
      api.post('/chat/read-announcements').catch(() => {});
      setUnreadMessagesCount(0);
    }
  }, [location.pathname]);

  // Real-time WebSocket synchronization across all roles & panels
  useEffect(() => {
    if (!socket) return;

    // 1. System-wide operational notification (Option A Bell icon)
    const handleSystemNotification = (payload) => {
      setNotifications((prev) => [
        {
          id: payload.id || 'notif-' + Date.now(),
          title: payload.title,
          message: payload.message,
          type: payload.type || 'SYSTEM',
          link: payload.link,
          isRead: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    };

    // 2. Course Creator queue increment
    const handleCreatorNew = () => {
      if (userRole === 'COURSE_CREATOR') {
        setPendingRequestsCount((prev) => prev + 1);
      }
    };

    // 3. Admin queue increment
    const handleAdminNew = () => {
      if (userRole === 'ADMIN') {
        setPendingRequestsCount((prev) => prev + 1);
      }
    };

    // 4. Admin password reset request increment
    const handlePasswordResetReq = () => {
      if (userRole === 'ADMIN') {
        setPasswordResetRequestsCount((prev) => prev + 1);
      }
    };

    // 5. Admin password reset completed decrement
    const handlePasswordResetDone = () => {
      if (userRole === 'ADMIN') {
        setPasswordResetRequestsCount((prev) => Math.max(0, prev - 1));
      }
    };

    // 6. User role updated live
    const handleRoleUpdated = () => {
      window.location.reload();
    };

    // 7. Mail & Chat message notifications (strictly for Mail icon)
    const handleNewAnnouncement = () => {
      if (location.pathname !== '/inbox') {
        setUnreadMessagesCount((prev) => prev + 1);
      }
    };

    const handleNewDirect = () => {
      if (location.pathname !== '/inbox') {
        setUnreadMessagesCount((prev) => prev + 1);
      }
    };

    socket.on('system_notification', handleSystemNotification);
    socket.on('creator_new_request', handleCreatorNew);
    socket.on('admin_new_request', handleAdminNew);
    socket.on('password_reset_requested', handlePasswordResetReq);
    socket.on('password_reset_completed', handlePasswordResetDone);
    socket.on('user_role_updated', handleRoleUpdated);
    socket.on('new_announcement', handleNewAnnouncement);
    socket.on('new_direct_message', handleNewDirect);

    return () => {
      socket.off('system_notification', handleSystemNotification);
      socket.off('creator_new_request', handleCreatorNew);
      socket.off('admin_new_request', handleAdminNew);
      socket.off('password_reset_requested', handlePasswordResetReq);
      socket.off('password_reset_completed', handlePasswordResetDone);
      socket.off('user_role_updated', handleRoleUpdated);
      socket.off('new_announcement', handleNewAnnouncement);
      socket.off('new_direct_message', handleNewDirect);
    };
  }, [socket, userRole, location.pathname]);

  // Navigation Items by Role with clean exact routes and real-time badges
  const navByRole = {
    ADMIN: [
      { label: 'Admin Dashboard', path: '/admin', icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
      { label: 'User Directory', path: '/admin/users', icon: <Users className="h-4 w-4" />, badge: passwordResetRequestsCount > 0 ? String(passwordResetRequestsCount) : null },
      { label: 'Course Management', path: '/admin/courses', icon: <BookOpen className="h-4 w-4" /> },
      { label: 'Approvals Hub', path: '/admin/approvals', icon: <CheckSquare className="h-4 w-4" />, badge: pendingRequestsCount > 0 ? String(pendingRequestsCount) : null },
      { label: 'Security & Audit Logs', path: '/admin/audit', icon: <ShieldAlert className="h-4 w-4" /> },
      { label: 'Inbox & Messages', path: '/inbox', icon: <Mail className="h-4 w-4" />, badge: unreadMessagesCount > 0 ? String(unreadMessagesCount) : null },
    ],
    COURSE_CREATOR: [
      { label: 'Creator Studio', path: '/creator/studio', icon: <Layers className="h-4 w-4" /> },
      { label: 'My Courses', path: '/creator/courses', icon: <BookOpen className="h-4 w-4" /> },
      { label: 'Question Banks', path: '/creator/assessments', icon: <FileCheck2 className="h-4 w-4" /> },
      { label: 'Student Review Queue', path: '/creator/requests', icon: <CheckSquare className="h-4 w-4" />, badge: pendingRequestsCount > 0 ? String(pendingRequestsCount) : null },
      { label: 'Inbox & Messages', path: '/inbox', icon: <Mail className="h-4 w-4" />, badge: unreadMessagesCount > 0 ? String(unreadMessagesCount) : null },
    ],
    MODERATOR: [
      { label: 'Moderator Overview', path: '/moderator', icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
      { label: 'User Directory (Read-Only)', path: '/moderator/users', icon: <Users className="h-4 w-4" /> },
      { label: 'Course Quality Review', path: '/moderator/courses', icon: <BookOpen className="h-4 w-4" /> },
      { label: 'Transfer Requests', path: '/moderator/transfers', icon: <CheckSquare className="h-4 w-4" /> },
      { label: 'Inbox & Messages', path: '/inbox', icon: <Mail className="h-4 w-4" />, badge: unreadMessagesCount > 0 ? String(unreadMessagesCount) : null },
    ],
    USER: [
      { label: 'Course Catalog', path: '/catalog', icon: <BookOpen className="h-4 w-4" /> },
      { label: 'My Learning', path: '/my-courses', icon: <GraduationCap className="h-4 w-4" /> },
      { label: 'Assessments & Exams', path: '/assessments', icon: <FileCheck2 className="h-4 w-4" /> },
      { label: 'My Certificates', path: '/certificates', icon: <Award className="h-4 w-4" /> },
      { label: 'Inbox & Messages', path: '/inbox', icon: <Mail className="h-4 w-4" />, badge: unreadMessagesCount > 0 ? String(unreadMessagesCount) : null },
    ],
  };

  const navItems = navByRole[userRole] || navByRole.USER;

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/courses?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-app text-app flex flex-col md:flex-row theme-transition">
      {/* 1. Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* 2. Deep Navy Sidebar (Smooth GPU-accelerated drawer sliding) */}
      <aside
        style={{
          width: sidebarCollapsed ? 0 : 256,
          minWidth: sidebarCollapsed ? 0 : 256,
          transition: 'all 450ms cubic-bezier(0.2, 0, 0, 1)',
        }}
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-sidebar text-sidebar-text flex flex-col border-sidebar-border md:sticky md:top-0 md:h-screen shrink-0 overflow-hidden',
          sidebarCollapsed ? 'border-r-0' : 'border-r',
          mobileOpen ? 'translate-x-0 !w-64' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div
          style={{
            transform: sidebarCollapsed ? 'translateX(-100%)' : 'translateX(0)',
            opacity: sidebarCollapsed ? 0 : 1,
            transition: 'transform 450ms cubic-bezier(0.2, 0, 0, 1), opacity 350ms ease',
          }}
          className="w-64 flex flex-col h-full shrink-0 overflow-hidden"
        >
          {/* Brand Header with Close Toggle */}
          <div className="h-14 px-4 flex items-center justify-between border-b border-sidebar-border shrink-0">
            <NavLink to="/" className="flex items-center group">
              <span className="text-xl font-black tracking-tight text-sidebar-text-bright group-hover:text-white transition-colors">
                Qualiva
              </span>
            </NavLink>

            <div className="flex items-center gap-1">
              {/* Desktop Minimal Sidebar Close Button */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                title="Collapse Sidebar"
                className="hidden md:flex p-1.5 rounded-full text-sidebar-muted hover:text-white hover:bg-sidebar-hover transition-colors"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>

              {/* Mobile Close Button */}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="md:hidden text-sidebar-muted hover:text-white p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Role Scope Badge */}
          <div className="px-4 py-2 bg-sidebar-hover/40 border-b border-sidebar-border/60 flex items-center justify-between text-xs shrink-0">
            <span className="text-sidebar-muted font-medium text-[11px]">Portal Access:</span>
            <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-mono text-[10px] font-bold uppercase tracking-wider">
              {userRole.replace('_', ' ')}
            </span>
          </div>

          {/* Navigation Links - Compact to fit smoothly on all screen heights */}
          <nav className="flex-1 min-h-0 px-3 py-2.5 space-y-1 overflow-y-auto scrollbar-none">
            <div className="px-3 pb-1 text-[10px] font-bold tracking-wider uppercase text-sidebar-muted">
              Menu Navigation
            </div>

            {navItems.map((item) => {
              // Strict exact match for root items, sub-path matching only for distinct sub-routes
              const isActive = item.exact
                ? location.pathname === item.path
                : location.pathname === item.path ||
                  (item.path === '/admin/audit' && location.pathname === '/admin/audit-logs') ||
                  (item.path !== '/creator' && item.path !== '/admin' && item.path !== '/moderator' && location.pathname.startsWith(item.path + '/'));

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-btn text-xs font-medium transition-all group select-none',
                    isActive
                      ? 'bg-sidebar-active text-sidebar-text-bright shadow-sm font-semibold'
                      : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-bright'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn('shrink-0 transition-colors', isActive ? 'text-brand-400' : 'text-sidebar-muted group-hover:text-sidebar-text-bright')}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    item.path === '/inbox' ? (
                      <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                    ) : (
                      <span className="px-1.5 py-0.2 min-w-[18px] text-center rounded-full bg-red-500 text-white font-mono text-[10px] font-bold shrink-0">
                        {item.badge}
                      </span>
                    )
                  )}
                </NavLink>
              );
            })}

            {/* Public links */}
            <div className="pt-2 px-3 pb-1 text-[10px] font-bold tracking-wider uppercase text-sidebar-muted">
              Public Gateway
            </div>
            <NavLink
              to="/verify"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-btn text-xs text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors"
            >
              <ShieldAlert className="h-4 w-4 text-teal-400 shrink-0" />
              <span>Verify Certificates</span>
            </NavLink>
          </nav>

          {/* Sidebar Footer / User Quick Info - Permanently Pinned at Viewport Bottom */}
          <div className="p-3.5 border-t border-sidebar-border bg-sidebar/95 shrink-0 mt-auto">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar
                  src={user?.avatar}
                  name={user?.name || 'User'}
                  size="sm"
                  status="online"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-sidebar-text-bright truncate leading-tight">
                    {user?.name || 'Anonymous'}
                  </p>
                  <p className="text-[10px] text-sidebar-muted truncate">
                    {user?.department || 'Member'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Link
                  to="/profile"
                  title="My Profile"
                  className="p-1.5 text-sidebar-muted hover:text-blue-400 hover:bg-sidebar-hover rounded-btn transition-colors"
                >
                  <User className="h-4 w-4" />
                </Link>

                {user?.role === 'ADMIN' && (
                  <Link
                    to="/admin/settings"
                    title="Database & Platform Settings"
                    className="p-1.5 text-sidebar-muted hover:text-indigo-400 hover:bg-sidebar-hover rounded-btn transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                )}

                <button
                  type="button"
                  onClick={logout}
                  title="Sign Out"
                  className="p-1.5 text-sidebar-muted hover:text-red-400 hover:bg-sidebar-hover rounded-btn transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* 3. Main Content Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 px-4 sm:px-8 border-b border-app bg-card/80 backdrop-blur-md flex items-center justify-between gap-4 sticky top-0 z-30">
          {/* Mobile Hamburger Toggle */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-2 rounded-btn hover:bg-elevated text-app-secondary"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-bold text-lg text-app">Qualiva</span>
          </div>

          {/* Desktop Sidebar Reopen Button (when collapsed) */}
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              title="Expand Sidebar"
              className="hidden md:flex items-center gap-2 p-2 -ml-3 rounded-btn text-app-secondary hover:text-app hover:bg-elevated transition-colors"
            >
              <PanelLeftOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="font-bold text-sm tracking-tight">Qualiva</span>
            </button>
          )}

          {/* Search Bar */}
          <div className="hidden md:flex items-center flex-1 max-w-md">
            <form onSubmit={handleSearchSubmit} className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search courses, modules, records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-4 text-xs rounded-full bg-elevated border border-app text-app focus:ring-1 focus:ring-brand-500 placeholder:text-app-muted transition-all"
              />
            </form>
          </div>

          {/* Right Header Action Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Minimal Borderless Theme Switcher */}
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              className="p-2 rounded-full text-app-secondary hover:text-app hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors"
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4 text-slate-700 transition-transform duration-300" />
              ) : (
                <Sun className="h-4 w-4 text-amber-400 rotate-0 transition-transform duration-300" />
              )}
            </button>

            {/* Minimal Borderless Inbox Direct Shortcut */}
            <NavLink
              to="/inbox"
              title="Inbox & Messages"
              className="p-2 rounded-full text-app-secondary hover:text-app hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors relative"
            >
              <Mail className="h-4 w-4" />
              {unreadMessagesCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </NavLink>

            {/* Minimal Borderless Notifications Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="p-2 rounded-full text-app-secondary hover:text-app hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors relative group"
              >
                <Bell className="h-4 w-4 text-app-secondary" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
                )}
              </button>

              {notificationsOpen && (
                <div
                  onClick={() => setNotificationsOpen(false)}
                  className="fixed inset-0 z-40"
                />
              )}

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-surface dark:bg-dark-surface border border-app rounded-dialog shadow-dialog p-4 z-50 animate-slide-up">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-app">
                    <span className="text-xs font-bold text-app uppercase tracking-wider">
                      System Notifications
                    </span>
                    {unreadNotificationsCount > 0 && (
                      <span
                        onClick={async () => {
                          await api.patch('/notifications/read-all').catch(() => {});
                          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                        }}
                        className="text-[10px] text-brand-600 dark:text-brand-400 font-semibold cursor-pointer hover:underline"
                      >
                        Mark all read
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-xs max-h-72 overflow-y-auto scrollbar-thin">
                    {notifications.length > 0 ? (
                      notifications.map((n, i) => (
                        <div
                          key={n.id || i}
                          onClick={async () => {
                            if (!n.isRead && n.id) {
                              api.patch(`/notifications/${n.id}/read`).catch(() => {});
                              setNotifications((prev) =>
                                prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
                              );
                            }
                            setNotificationsOpen(false);
                            if (n.link) navigate(n.link);
                          }}
                          className="p-2.5 rounded-btn bg-elevated border border-app flex items-start gap-2.5 cursor-pointer hover:bg-surface transition-colors"
                        >
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full mt-1.5 shrink-0',
                              n.isRead ? 'bg-slate-400 dark:bg-slate-600' : 'bg-red-500'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-app truncate">{n.title}</p>
                            <p className="text-[11px] text-app-secondary line-clamp-2">{n.message}</p>
                            <span className="text-[10px] text-app-muted mt-1 block">
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-app-muted">
                        No system alerts at this time.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Premium Minimal Borderless Profile Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2.5 p-1 pr-2.5 rounded-full hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-all text-left group"
              >
                <Avatar
                  src={user?.avatar}
                  name={user?.name || 'User'}
                  size="sm"
                />
                <div className="hidden lg:block leading-tight">
                  <span className="text-xs font-bold text-app group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors block">{user?.name || 'Member'}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono font-medium">{userRole}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-app transition-colors" />
              </button>

              {profileDropdownOpen && (
                <div
                  onClick={() => setProfileDropdownOpen(false)}
                  className="fixed inset-0 z-40"
                />
              )}

              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-surface dark:bg-dark-surface border border-app rounded-dialog shadow-dialog py-2 z-50 animate-slide-up">
                  <div className="px-4 py-2 border-b border-app">
                    <p className="text-xs font-bold text-app truncate">{user?.name}</p>
                    <p className="text-[11px] text-app-muted truncate font-mono">{user?.email}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <span className="text-xs font-semibold text-app">Active</span>
                    </div>
                  </div>

                  <div className="py-1">
                    <Link
                      to="/profile"
                      onClick={() => setProfileDropdownOpen(false)}
                      className="w-full text-left px-4 py-2 text-xs text-app hover:bg-elevated flex items-center gap-2.5 transition-colors font-medium"
                    >
                      <User className="h-3.5 w-3.5 text-blue-500" />
                      <span>My Profile</span>
                    </Link>

                    {user?.role === 'ADMIN' && (
                      <Link
                        to="/admin/settings"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="w-full text-left px-4 py-2 text-xs text-app hover:bg-elevated flex items-center gap-2.5 transition-colors font-medium"
                      >
                        <Settings className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Database & Settings</span>
                      </Link>
                    )}

                    <div className="my-1 border-t border-app" />

                    <button
                      type="button"
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-elevated flex items-center gap-2.5 transition-colors font-medium"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Nested Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
