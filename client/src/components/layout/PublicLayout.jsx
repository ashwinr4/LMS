import { Outlet, Link } from 'react-router-dom';
import { PublicNavbar } from './PublicNavbar.jsx';
import { ShieldCheck, Lock, Award, Heart } from 'lucide-react';

export function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-app text-app theme-transition selection:bg-brand-500 selection:text-white">
      {/* 1. Public Full-Width Header */}
      <PublicNavbar />

      {/* 2. Main Public Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* 3. Modern Public Footer */}
      <footer className="border-t border-app bg-surface/40 dark:bg-dark-surface/40 py-8 mt-12 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-app-secondary">
          <div className="flex items-center gap-2">
            <span className="font-bold text-app">Qualiva</span>
            <span>•</span>
            <span>Enterprise Learning & Module Governance</span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/courses" className="hover:text-app transition-colors">Course Catalog</Link>
            <Link to="/verify" className="hover:text-app transition-colors">Certificate Ledger</Link>
            <Link to="/login" className="hover:text-app transition-colors">Sign In</Link>
            <Link to="/register" className="hover:text-app transition-colors">Register</Link>
          </div>

          <div className="text-[11px] text-app-muted">
            &copy; 2026 Qualiva Enterprise. High-Stakes Training Governance.
          </div>
        </div>
      </footer>
    </div>
  );
}
