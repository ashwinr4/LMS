import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import {
  ShieldCheck,
  BookOpen,
  Award,
  Zap,
  Lock,
  Eye,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Layers,
  Terminal,
  Activity,
  UserCheck,
  Clock,
  ExternalLink,
} from 'lucide-react';

export default function Landing() {
  const { isAuthenticated, user } = useAuth();

  const getRoleDashboardPath = () => {
    if (!user) return '/courses';
    if (user.role === 'ADMIN') return '/admin';
    if (user.role === 'COURSE_CREATOR') return '/creator';
    if (user.role === 'MODERATOR') return '/moderator';
    return '/courses';
  };

  return (
    <div className="space-y-16 py-4 animate-fade-in">
      {/* 1. Hero Section */}
      <section className="relative overflow-hidden rounded-card bg-card border border-app p-8 sm:p-12 lg:p-16 shadow-sm">
        {/* Background glow effects */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 border border-brand-200 dark:border-brand-800 text-xs font-semibold">
            <ShieldCheck className="h-4 w-4" />
            <span>Enterprise Secure Module Management System (ESMMS)</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-app leading-[1.1]">
            Next-Generation Enterprise Learning & Governance
          </h1>

          <p className="text-base sm:text-lg text-app-secondary leading-relaxed">
            Engineered for high-stakes technical organizations. Featuring 3-stage enrollment approval pipelines, dual-database hot standby replication, anti-cheat proctored certification, and cryptographic SHA-256 tamper-proof credential verification.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            {isAuthenticated ? (
              <Link to={getRoleDashboardPath()}>
                <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Enter Dashboard ({user?.role?.replace('_', ' ')})
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/register">
                  <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                    Get Started / Register
                  </Button>
                </Link>
                <Link to="/login">
                  <Button variant="secondary" size="lg">
                    Sign In
                  </Button>
                </Link>
              </>
            )}

            <Link to="/courses">
              <Button variant="outline" size="lg" leftIcon={<BookOpen className="h-4 w-4 text-brand-500" />}>
                Explore Catalog
              </Button>
            </Link>

            <Link to="/verify">
              <Button variant="ghost" size="lg" leftIcon={<Award className="h-4 w-4 text-teal-500" />}>
                Verify Certificate
              </Button>
            </Link>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 border-t border-app text-xs">
            <div>
              <span className="block text-2xl font-bold text-app font-mono">100%</span>
              <span className="text-app-muted">Pure JavaScript Architecture</span>
            </div>
            <div>
              <span className="block text-2xl font-bold text-brand-600 dark:text-brand-400 font-mono">14 Days</span>
              <span className="text-app-muted">Default Completion Window</span>
            </div>
            <div>
              <span className="block text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">&lt; 1.5s</span>
              <span className="text-app-muted">50+ User Bulk Excel Ingest</span>
            </div>
            <div>
              <span className="block text-2xl font-bold text-purple-600 dark:text-purple-400 font-mono">SHA-256</span>
              <span className="text-app-muted">Cryptographic Proof</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Platform Capabilities Grid */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-app tracking-tight">
            Core Architectural Capabilities
          </h2>
          <p className="text-xs sm:text-sm text-app-secondary">
            Built specifically to address enterprise compliance, security rigor, and role-driven training workflows.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: <Lock className="h-6 w-6 text-brand-600 dark:text-brand-400" />,
              title: 'Dual-Token Rotation & Lockout',
              desc: '15-minute access token combined with 7-day HttpOnly cookie rotation. Automatic 15-minute lockout upon 5 consecutive failed passwords.',
            },
            {
              icon: <Zap className="h-6 w-6 text-amber-500" />,
              title: '3-Stage Enrollment State Machine',
              desc: 'Student request → Creator endorsement → Admin sign-off. Real-time WebSocket waiting room triggers live celebration and auto-redirect.',
            },
            {
              icon: <Eye className="h-6 w-6 text-red-500" />,
              title: 'Anti-Cheat Proctored Exams',
              desc: 'Continuous window blur & tab-switch strike monitoring with Fisher-Yates randomized question sampling from vast question pools.',
            },
            {
              icon: <Award className="h-6 w-6 text-teal-500" />,
              title: 'Tamper-Proof Certificates',
              desc: 'Unique certificate code with immutable SHA-256 hash calculated from user, score, timestamp, and server secret for instant public verification.',
            },
            {
              icon: <BookOpen className="h-6 w-6 text-indigo-500" />,
              title: 'Multi-Modal Sequential Player',
              desc: 'Native video, YouTube embeds, Markdown docs, and PDFs with strict sequential unlocking and 5-second playback timestamp persistence.',
            },
            {
              icon: <Activity className="h-6 w-6 text-purple-500" />,
              title: 'Immutable SIEM Audit Ledger',
              desc: 'Every login, lockout, enrollment approval, and curriculum change logged with actor IP, timestamp, and Low/Medium/High risk ratings.',
            },
          ].map((card, idx) => (
            <div
              key={idx}
              className="bg-card border border-app rounded-card p-6 space-y-3 hover:border-brand-500/50 hover:shadow-overlay transition-all"
            >
              <div className="p-2.5 rounded-btn bg-elevated w-fit border border-app">
                {card.icon}
              </div>
              <h3 className="text-base font-bold text-app">{card.title}</h3>
              <p className="text-xs text-app-secondary leading-relaxed">
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 3-Stage Approval Stepper Preview */}
      <section className="bg-card border border-app rounded-card p-8 sm:p-10 space-y-8 shadow-sm">
        <div className="max-w-xl space-y-1">
          <span className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider">
            Workflow Governance
          </span>
          <h2 className="text-2xl font-bold text-app tracking-tight">
            The 3-Stage Enrollment Pipeline
          </h2>
          <p className="text-xs text-app-secondary">
            Zero unsupervised enrollments. Full chain of custody from application to assignment.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6 relative">
          <div className="p-5 rounded-btn bg-elevated border border-app space-y-3 relative">
            <div className="flex items-center justify-between">
              <span className="h-7 w-7 rounded-full bg-brand-500 text-white font-bold text-xs flex items-center justify-center">
                1
              </span>
              <StatusBadge status="PENDING_CREATOR" size="xs" />
            </div>
            <h4 className="font-bold text-sm text-app">Student Application</h4>
            <p className="text-xs text-app-secondary leading-relaxed">
              Student submits personal learning goals and motivation. WebSockets notify the Course Creator room in real-time.
            </p>
          </div>

          <div className="p-5 rounded-btn bg-elevated border border-app space-y-3 relative">
            <div className="flex items-center justify-between">
              <span className="h-7 w-7 rounded-full bg-purple-500 text-white font-bold text-xs flex items-center justify-center">
                2
              </span>
              <StatusBadge status="FORWARDED_TO_ADMIN" size="xs" />
            </div>
            <h4 className="font-bold text-sm text-app">Creator Endorsement</h4>
            <p className="text-xs text-app-secondary leading-relaxed">
              Course creator inspects student background, adds recommendation notes, and forwards the application to Admin queue.
            </p>
          </div>

          <div className="p-5 rounded-btn bg-elevated border border-app space-y-3 relative">
            <div className="flex items-center justify-between">
              <span className="h-7 w-7 rounded-full bg-emerald-500 text-white font-bold text-xs flex items-center justify-center">
                3
              </span>
              <StatusBadge status="APPROVED" size="xs" />
            </div>
            <h4 className="font-bold text-sm text-app">Admin Approval & Launch</h4>
            <p className="text-xs text-app-secondary leading-relaxed">
              Admin final sign-off sets 14-day completion deadline. Live student waiting room fires confetti and auto-opens the course in 3s.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Public Verification Callout */}
      <section className="bg-gradient-to-br from-brand-900/40 via-card to-card border border-brand-500/30 rounded-card p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-teal-400" />
            <h3 className="text-xl font-bold text-app">
              Public Cryptographic Certificate Registry
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-app-secondary leading-relaxed">
            Verify any issued graduation certificate instantly with zero login required. Enter certificate code <code className="font-mono bg-elevated px-1.5 py-0.5 rounded text-brand-400">QLV-2026-00142</code> to see live cryptographic validation.
          </p>
        </div>

        <Link to="/verify" className="shrink-0">
          <Button size="lg" leftIcon={<ShieldCheck className="h-4 w-4" />}>
            Open Public Verification
          </Button>
        </Link>
      </section>
    </div>
  );
}
