import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Button } from '../ui/Button.jsx';
import {
  Award,
  BookOpen,
  Sun,
  Moon,
  LogOut,
  ArrowRight,
} from 'lucide-react';

export function PublicNavbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const getDashboardLink = () => {
    if (!user) return '/courses';
    if (user.role === 'ADMIN') return '/admin';
    if (user.role === 'COURSE_CREATOR') return '/creator';
    if (user.role === 'MODERATOR') return '/moderator';
    return '/my-courses';
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-app bg-surface/90 dark:bg-dark-surface/90 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between relative">
        {/* 1. Left: Clean Brand Wordmark */}
        <div className="flex items-center">
          <Link to="/" className="flex items-center group">
            <span className="font-black text-2xl tracking-tight text-app group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
              Qualiva
            </span>
          </Link>
        </div>

        {/* 2. Center: Perfectly Centered Pill Navigation */}
        <nav className="hidden md:flex items-center absolute left-1/2 -translate-x-1/2 bg-surface-tertiary/70 dark:bg-dark-elevated/70 border border-app rounded-full p-1 shadow-sm backdrop-blur-md text-xs font-semibold">
          <NavLink
            to="/courses"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all ${
                isActive
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'text-app-secondary hover:text-app hover:bg-surface/50 dark:hover:bg-dark-surface/50'
              }`
            }
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Course Catalog</span>
          </NavLink>

          <NavLink
            to="/verify"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all ${
                isActive
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'text-app-secondary hover:text-app hover:bg-surface/50 dark:hover:bg-dark-surface/50'
              }`
            }
          >
            <Award className="h-3.5 w-3.5" />
            <span>Verify Certificate</span>
          </NavLink>
        </nav>

        {/* 3. Right: Circular Toggle & Actions */}
        <div className="flex items-center gap-3">
          {/* Minimal Borderless Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-full text-app-secondary hover:text-app hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400 rotate-0 transition-transform duration-300" />
            ) : (
              <Moon className="h-4 w-4 text-slate-700 transition-transform duration-300" />
            )}
          </button>

          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Link to={getDashboardLink()}>
                <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Dashboard
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                title="Sign Out"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full h-9 w-9 p-0 flex items-center justify-center"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Create Account
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
