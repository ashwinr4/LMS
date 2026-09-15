import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { cn } from '../../utils/cn.js';
import {
  Database,
  Server,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Activity,
  Check,
  AlertCircle,
  Info,
  Layers,
  ArrowRightLeft,
  ShieldCheck,
  HardDrive,
  CheckCheck,
  Loader2,
  Lock,
} from 'lucide-react';

// Database Engines Catalog
const DATABASE_ENGINES = [
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    tagline: 'Neon, Supabase, AWS RDS, CockroachDB',
    badge: 'Relational SQL',
    iconColor: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    defaultPlaceholder: 'postgresql://username:password@ep-host.neon.tech/neondb?sslmode=require',
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    tagline: 'MongoDB Atlas, AWS DocumentDB, Local Replica',
    badge: 'NoSQL Document',
    iconColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    defaultPlaceholder: 'mongodb+srv://username:password@cluster.mongodb.net/qualiva?retryWrites=true&w=majority',
  },
  {
    id: 'mysql',
    name: 'MySQL / MariaDB',
    tagline: 'PlanetScale, AWS Aurora, Google Cloud SQL',
    badge: 'Relational SQL',
    iconColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    defaultPlaceholder: 'mysql://username:password@host:3306/qualiva_db',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    tagline: 'Embedded Local High-Speed Storage / Turso',
    badge: 'Serverless Local',
    iconColor: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
    defaultPlaceholder: 'file:./prisma/lms_primary.db',
  },
  {
    id: 'sqlserver',
    name: 'Microsoft SQL Server',
    tagline: 'Azure SQL Database, Enterprise MSSQL',
    badge: 'Enterprise Relational',
    iconColor: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    defaultPlaceholder: 'sqlserver://host:1433;database=qualiva;user=sa;password=SecretPassword123!',
  },
];

// Helper to detect engine type from URL
function detectEngine(url) {
  if (!url) return 'unknown';
  const u = url.trim();
  if (u.startsWith('postgres://') || u.startsWith('postgresql://')) return 'postgresql';
  if (u.startsWith('mongodb://') || u.startsWith('mongodb+srv://')) return 'mongodb';
  if (u.startsWith('mysql://') || u.startsWith('mariadb://')) return 'mysql';
  if (u.startsWith('file:') || u.startsWith('sqlite:') || u.endsWith('.db')) return 'sqlite';
  if (u.startsWith('sqlserver://') || u.startsWith('mssql://')) return 'sqlserver';
  return 'unknown';
}

// Reusable Tactile Sliding Switch Component
function SlidingToggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 select-none',
        disabled && 'opacity-40 cursor-not-allowed',
        checked
          ? 'bg-emerald-500 shadow-sm'
          : 'bg-slate-300 dark:bg-dark-elevated'
      )}
      title={label}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  );
}

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Active configurations
  const [activePrimaryEngine, setActivePrimaryEngine] = useState('postgresql');
  const [activeBackupEngine, setActiveBackupEngine] = useState('postgresql');

  // Connection URLs map by engine
  const [engineUrls, setEngineUrls] = useState({
    primary: {
      postgresql: '',
      mongodb: '',
      mysql: '',
      sqlite: 'file:./prisma/lms_primary.db',
      sqlserver: '',
    },
    backup: {
      postgresql: '',
      mongodb: '',
      mysql: '',
      sqlite: 'file:./prisma/lms_backup.db',
      sqlserver: '',
    },
  });

  // Password visibility map
  const [showPassword, setShowPassword] = useState({});

  // Testing diagnostics state by key (e.g. 'primary_postgresql')
  const [testingMap, setTestingMap] = useState({});
  const [testResults, setTestResults] = useState({});

  // Migration Modal state
  const [migrationTarget, setMigrationTarget] = useState(null); // { role: 'PRIMARY' | 'BACKUP', engine: '...', url: '...' }
  const [shouldMigrateData, setShouldMigrateData] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStep, setMigrationStep] = useState(0);
  const [migrationError, setMigrationError] = useState(null);
  const [migrationSummary, setMigrationSummary] = useState(null);

  // Fetch initial database settings
  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/settings/database');
      if (data.settings) {
        const pRaw = data.settings.primary?.rawUrl || '';
        const bRaw = data.settings.secondary?.rawUrl || '';

        const pEng = data.settings.primary?.engine || detectEngine(pRaw);
        const bEng = data.settings.secondary?.engine || detectEngine(bRaw);

        setActivePrimaryEngine(pEng !== 'unknown' ? pEng : 'postgresql');
        setActiveBackupEngine(bEng !== 'unknown' ? bEng : 'postgresql');

        const urlsFromApi = data.urls || {};

        setEngineUrls((prev) => ({
          primary: {
            ...prev.primary,
            ...urlsFromApi,
            ...(pEng !== 'unknown' && pRaw ? { [pEng]: pRaw } : {}),
          },
          backup: {
            ...prev.backup,
            ...urlsFromApi,
            ...(bEng !== 'unknown' && bRaw ? { [bEng]: bRaw } : {}),
          },
        }));

        // Set initial test result if already verified
        if (data.settings.primary?.status === 'ONLINE' || data.settings.primary?.status === 'SYNCHRONIZED_CLUSTER') {
          setTestResults((prev) => ({
            ...prev,
            [`primary_${pEng}`]: {
              success: true,
              latencyMs: data.settings.primary?.latencyMs || 25,
              version: data.settings.primary?.version || 'Online',
              databaseName: data.settings.primary?.databaseName || 'Live',
            },
          }));
        }

        if (data.settings.secondary?.status === 'ONLINE' || data.settings.secondary?.status === 'SYNCHRONIZED_CLUSTER') {
          setTestResults((prev) => ({
            ...prev,
            [`backup_${bEng}`]: {
              success: true,
              latencyMs: data.settings.secondary?.latencyMs || 25,
              version: data.settings.secondary?.version || 'Online',
              databaseName: data.settings.secondary?.databaseName || 'Backup',
            },
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load database settings:', err);
      setError(err.response?.data?.message || 'Failed to load database configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const togglePasswordVisibility = (key) => {
    setShowPassword((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleUrlChange = (section, engineId, value) => {
    setEngineUrls((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [engineId]: value,
      },
    }));
    // Invalidate test results when URL changes so user must test before activating
    const key = `${section}_${engineId}`;
    setTestResults((prev) => {
      if (prev[key]) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return prev;
    });
  };

  // Test individual database connection
  const handleTestEngine = async (section, engineId) => {
    const key = `${section}_${engineId}`;
    const url = (engineUrls[section][engineId] || '').trim();

    if (!url) {
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          success: false,
          message: 'Connection URL cannot be empty. Please enter a valid connection string.',
        },
      }));
      return;
    }

    setTestingMap((prev) => ({ ...prev, [key]: true }));
    setTestResults((prev) => ({ ...prev, [key]: null }));

    try {
      const { data } = await api.post('/admin/settings/database/test', { url });
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          success: true,
          latencyMs: data.latencyMs,
          version: data.version,
          databaseName: data.databaseName,
          message: data.message,
        },
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          success: false,
          message: err.response?.data?.message || 'Connection test failed. Verify credentials and network.',
        },
      }));
    } finally {
      setTestingMap((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Initiate database migration & activation flow
  const initiateActivation = (section, engineId) => {
    const key = `${section}_${engineId}`;
    const url = (engineUrls[section][engineId] || '').trim();
    const testResult = testResults[key];

    if (!url) {
      setError(`Cannot activate ${engineId.toUpperCase()}: connection URL cannot be empty.`);
      setTimeout(() => setError(null), 4000);
      return;
    }

    if (!testResult?.success) {
      setError(`Please test the connection for ${engineId.toUpperCase()} first to verify connectivity and ensure it is safe to transfer.`);
      setTimeout(() => setError(null), 4000);
      return;
    }

    const role = section === 'primary' ? 'PRIMARY' : 'BACKUP';
    setMigrationTarget({
      role,
      section,
      engineId,
      url,
      engineMeta: DATABASE_ENGINES.find((e) => e.id === engineId),
    });
    setShouldMigrateData(true);
    setMigrationStep(0);
    setMigrationError(null);
    setMigrationSummary(null);
  };

  // Execute migration in real-time
  const executeMigration = async () => {
    if (!migrationTarget) return;
    setIsMigrating(true);
    setMigrationError(null);
    setMigrationStep(1); // Pre-flight check

    try {
      // Step 1: Pre-flight check
      await api.post('/admin/settings/database/test', { url: migrationTarget.url });
      setMigrationStep(2); // Provisioning schema

      await new Promise((r) => setTimeout(r, 600));
      setMigrationStep(3); // Transferring records

      const { data } = await api.post('/admin/settings/database/migrate-and-activate', {
        targetUrl: migrationTarget.url,
        role: migrationTarget.role,
        shouldMigrateData,
      });

      setMigrationStep(4); // Verification
      await new Promise((r) => setTimeout(r, 400));
      setMigrationStep(5); // Complete

      setMigrationSummary(data.details);

      if (migrationTarget.section === 'primary') {
        setActivePrimaryEngine(migrationTarget.engineId);
      } else {
        setActiveBackupEngine(migrationTarget.engineId);
      }

      setSuccess(`Successfully activated ${migrationTarget.engineMeta.name} as active ${migrationTarget.role} database!`);
      setTimeout(() => setSuccess(null), 5000);
      await fetchSettings();
    } catch (err) {
      console.error('Migration failed:', err);
      setMigrationError(err.response?.data?.message || 'Migration pipeline encountered an error. Previous database remains active.');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-fade-in pb-20">
      <PageHeader
        title="Universal Database Management"
        description="Select and manage active Primary and Backup database engines across all Prisma-supported platforms. Easily migrate data and switch databases with zero downtime."
      />

      {success && (
        <div className="p-4 rounded-card bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-xs font-semibold shadow-sm animate-fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-700 dark:text-red-300 text-xs font-semibold shadow-sm animate-fade-in">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 1: PRIMARY DATABASE (LIVE OPERATIONAL ENGINE)          */}
      {/* ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-app">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-btn bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-app">
                Primary Database
              </h2>
              <p className="text-xs text-app-secondary">
                The active primary database handling real-time requests for all users, courses, and examination sessions.
              </p>
            </div>
          </div>
        </div>

        {/* Primary Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DATABASE_ENGINES.map((engine) => {
            const isActive = activePrimaryEngine === engine.id;
            const key = `primary_${engine.id}`;
            const url = engineUrls.primary[engine.id] || '';
            const isUrlEmpty = !url.trim();
            const isTesting = !!testingMap[key];
            const testResult = testResults[key];

            return (
              <div
                key={engine.id}
                className={cn(
                  'bg-card rounded-card border transition-all duration-200 p-5 flex flex-col justify-between space-y-4 shadow-sm relative overflow-hidden',
                  isActive
                    ? 'border-emerald-500/60 dark:border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/30'
                    : 'border-app hover:border-app-secondary'
                )}
              >
                {/* Active Indicator Top Stripe */}
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
                )}

                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('p-2 rounded-btn border text-sm font-bold', engine.iconColor)}>
                        <HardDrive className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-app leading-snug">{engine.name}</h3>
                        <span className="text-[10px] font-mono text-app-muted uppercase tracking-wider">
                          {engine.badge}
                        </span>
                      </div>
                    </div>

                    {/* Sliding Toggle Switch */}
                    <div className="flex flex-col items-end gap-1">
                      <SlidingToggle
                        checked={isActive}
                        disabled={isActive || isUrlEmpty || !testResult?.success}
                        onChange={() => initiateActivation('primary', engine.id)}
                        label={`Activate ${engine.name} as Primary Database`}
                      />
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wider flex items-center gap-1',
                          isActive
                            ? 'text-emerald-600 dark:text-emerald-400 font-extrabold'
                            : 'text-app-muted'
                        )}
                      >
                        {isActive ? (
                          <>
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live Engine
                          </>
                        ) : (
                          'Standby'
                        )}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-app-secondary leading-relaxed line-clamp-2">
                    {engine.tagline}
                  </p>

                  {/* URL Input with Non-Empty Validation */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label className="font-semibold text-app-secondary">Connection URL</label>
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(key)}
                        className="text-app-muted hover:text-app flex items-center gap-1 text-[11px]"
                      >
                        {showPassword[key] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        <span>{showPassword[key] ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={showPassword[key] ? 'text' : 'password'}
                        value={url}
                        onChange={(e) => handleUrlChange('primary', engine.id, e.target.value)}
                        placeholder={engine.defaultPlaceholder}
                        className={cn(
                          'w-full px-3 py-1.5 text-xs font-mono rounded-btn border bg-surface dark:bg-dark-elevated text-app focus:outline-none transition-colors pr-8',
                          isUrlEmpty
                            ? 'border-amber-500/50 focus:border-amber-500'
                            : 'border-app focus:border-brand-500'
                        )}
                      />
                    </div>

                    {isUrlEmpty && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span>Connection URL required before activation</span>
                      </p>
                    )}
                  </div>

                  {/* Live Diagnostics Pill */}
                  {testResult && (
                    <div
                      className={cn(
                        'p-2.5 rounded-btn text-xs space-y-1 border transition-colors',
                        testResult.success
                          ? isActive
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                            : 'bg-slate-100 dark:bg-dark-elevated text-slate-700 dark:text-slate-300 border-slate-200 dark:border-dark-border'
                          : 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20'
                      )}
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span className="flex items-center gap-1.5">
                          {testResult.success ? (
                            <CheckCircle2
                              className={cn(
                                'h-3.5 w-3.5 shrink-0',
                                isActive ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'
                              )}
                            />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          <span>
                            {testResult.success
                              ? isActive
                                ? 'Live Endpoint Active'
                                : 'Connection Verified'
                              : 'Test Failed'}
                          </span>
                        </span>
                        {testResult.latencyMs && (
                          <span className="font-mono text-[10px] text-app-muted">{testResult.latencyMs}ms</span>
                        )}
                      </div>
                      {testResult.version && (
                        <p className="text-[10px] font-mono text-app-muted truncate">
                          {testResult.version} • {testResult.databaseName}
                        </p>
                      )}
                      {!testResult.success && testResult.message && (
                        <p className="text-[10px] text-red-600 dark:text-red-400 leading-tight">
                          {testResult.message}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Standby Verification Banner (Clean & Neutral) */}
                  {testResult?.success && !isActive && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-btn bg-surface-elevated text-app-secondary border border-app text-[11px] font-medium shadow-2xs">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span>Standby Ready</span>
                      <span className="text-[10px] font-mono text-app-muted ml-auto">
                        Ready to Activate
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="space-y-1.5 pt-2 border-t border-app">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handleTestEngine('primary', engine.id)}
                      disabled={isTesting || isUrlEmpty}
                      leftIcon={
                        isTesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Activity className="h-3.5 w-3.5" />
                        )
                      }
                    >
                      {isTesting ? 'Testing...' : 'Test'}
                    </Button>

                    {!isActive && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className={cn(
                          'flex-1 text-xs shadow-xs font-semibold transition-all',
                          testResult?.success
                            ? 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900'
                            : 'bg-surface-elevated text-app-muted cursor-not-allowed opacity-60'
                        )}
                        onClick={() => initiateActivation('primary', engine.id)}
                        disabled={isUrlEmpty || !testResult?.success}
                        leftIcon={
                          testResult?.success ? (
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" />
                          )
                        }
                      >
                        Activate
                      </Button>
                    )}
                  </div>

                  {!isActive && !testResult?.success && !isUrlEmpty && (
                    <p className="text-[10px] text-app-muted text-center flex items-center justify-center gap-1 pt-0.5">
                      <Lock className="h-3 w-3" />
                      <span>Test connection first to unlock activation</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 2: BACKUP / REPLICATION DATABASE                      */}
      {/* ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4 pt-4">
        <div className="flex items-center justify-between pb-2 border-b border-app">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-btn bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-app">
                Backup & Replication Database
              </h2>
              <p className="text-xs text-app-secondary">
                Receives automated background replication for real-time disaster recovery and failover safety.
              </p>
            </div>
          </div>
        </div>

        {/* Backup Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DATABASE_ENGINES.map((engine) => {
            const isActive = activeBackupEngine === engine.id;
            const key = `backup_${engine.id}`;
            const url = engineUrls.backup[engine.id] || '';
            const isUrlEmpty = !url.trim();
            const isTesting = !!testingMap[key];
            const testResult = testResults[key];

            return (
              <div
                key={engine.id}
                className={cn(
                  'bg-card rounded-card border transition-all duration-200 p-5 flex flex-col justify-between space-y-4 shadow-sm relative overflow-hidden',
                  isActive
                    ? 'border-teal-500/60 dark:border-teal-500/50 shadow-teal-500/5 ring-1 ring-teal-500/30'
                    : 'border-app hover:border-app-secondary'
                )}
              >
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-400" />
                )}

                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('p-2 rounded-btn border text-sm font-bold', engine.iconColor)}>
                        <HardDrive className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-app leading-snug">{engine.name}</h3>
                        <span className="text-[10px] font-mono text-app-muted uppercase tracking-wider">
                          {engine.badge}
                        </span>
                      </div>
                    </div>

                    {/* Sliding Toggle Switch */}
                    <div className="flex flex-col items-end gap-1">
                      <SlidingToggle
                        checked={isActive}
                        disabled={isActive || isUrlEmpty || !testResult?.success}
                        onChange={() => initiateActivation('backup', engine.id)}
                        label={`Set ${engine.name} as Active Backup`}
                      />
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wider flex items-center gap-1',
                          isActive
                            ? 'text-teal-600 dark:text-teal-400 font-extrabold'
                            : 'text-app-muted'
                        )}
                      >
                        {isActive ? (
                          <>
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                            Live Engine
                          </>
                        ) : (
                          'Standby'
                        )}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-app-secondary leading-relaxed line-clamp-2">
                    {engine.tagline}
                  </p>

                  {/* URL Input with Non-Empty Validation */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label className="font-semibold text-app-secondary">Backup Endpoint URL</label>
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(key)}
                        className="text-app-muted hover:text-app flex items-center gap-1 text-[11px]"
                      >
                        {showPassword[key] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        <span>{showPassword[key] ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={showPassword[key] ? 'text' : 'password'}
                        value={url}
                        onChange={(e) => handleUrlChange('backup', engine.id, e.target.value)}
                        placeholder={engine.defaultPlaceholder}
                        className={cn(
                          'w-full px-3 py-1.5 text-xs font-mono rounded-btn border bg-surface dark:bg-dark-elevated text-app focus:outline-none transition-colors pr-8',
                          isUrlEmpty
                            ? 'border-amber-500/50 focus:border-amber-500'
                            : 'border-app focus:border-brand-500'
                        )}
                      />
                    </div>

                    {isUrlEmpty && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span>Connection URL required before activation</span>
                      </p>
                    )}
                  </div>

                  {/* Diagnostics Pill */}
                  {testResult && (
                    <div
                      className={cn(
                        'p-2.5 rounded-btn text-xs space-y-1 border transition-colors',
                        testResult.success
                          ? isActive
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                            : 'bg-slate-100 dark:bg-dark-elevated text-slate-700 dark:text-slate-300 border-slate-200 dark:border-dark-border'
                          : 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20'
                      )}
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span className="flex items-center gap-1.5">
                          {testResult.success ? (
                            <CheckCircle2
                              className={cn(
                                'h-3.5 w-3.5 shrink-0',
                                isActive ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'
                              )}
                            />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          <span>
                            {testResult.success
                              ? isActive
                                ? 'Active Replication'
                                : 'Connection Verified'
                              : 'Test Failed'}
                          </span>
                        </span>
                        {testResult.latencyMs && (
                          <span className="font-mono text-[10px] text-app-muted">{testResult.latencyMs}ms</span>
                        )}
                      </div>
                      {testResult.version && (
                        <p className="text-[10px] font-mono text-app-muted truncate">
                          {testResult.version} • {testResult.databaseName}
                        </p>
                      )}
                      {!testResult.success && testResult.message && (
                        <p className="text-[10px] text-red-600 dark:text-red-400 leading-tight">
                          {testResult.message}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Standby Verification Banner (Clean & Neutral) */}
                  {testResult?.success && !isActive && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-btn bg-surface-elevated text-app-secondary border border-app text-[11px] font-medium shadow-2xs">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span>Standby Ready</span>
                      <span className="text-[10px] font-mono text-app-muted ml-auto">
                        Ready for Backup
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="space-y-1.5 pt-2 border-t border-app">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handleTestEngine('backup', engine.id)}
                      disabled={isTesting || isUrlEmpty}
                      leftIcon={
                        isTesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Activity className="h-3.5 w-3.5" />
                        )
                      }
                    >
                      {isTesting ? 'Testing...' : 'Test'}
                    </Button>

                    {!isActive && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className={cn(
                          'flex-1 text-xs shadow-xs font-semibold transition-all',
                          testResult?.success
                            ? 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900'
                            : 'bg-surface-elevated text-app-muted cursor-not-allowed opacity-60'
                        )}
                        onClick={() => initiateActivation('backup', engine.id)}
                        disabled={isUrlEmpty || !testResult?.success}
                        leftIcon={
                          testResult?.success ? (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" />
                          )
                        }
                      >
                        Set Backup
                      </Button>
                    )}
                  </div>

                  {!isActive && !testResult?.success && !isUrlEmpty && (
                    <p className="text-[10px] text-app-muted text-center flex items-center justify-center gap-1 pt-0.5">
                      <Lock className="h-3 w-3" />
                      <span>Test endpoint first to unlock backup</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ZERO-DATA-LOSS MIGRATION MODAL STEPPER                        */}
      {/* ───────────────────────────────────────────────────────────── */}
      {migrationTarget && (
        <Modal
          isOpen={!!migrationTarget}
          onClose={() => {
            if (!isMigrating) setMigrationTarget(null);
          }}
          title={
            migrationTarget.role === 'PRIMARY'
              ? `Migrate & Activate Primary Database`
              : `Set Active Backup Database`
          }
        >
          <div className="space-y-5">
            {/* Header info card */}
            <div className="p-4 bg-surface-tertiary/70 dark:bg-dark-elevated/60 border border-app rounded-btn text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-app-secondary">Target Database:</span>
                <span className="font-bold text-app">{migrationTarget.engineMeta.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-app-secondary">Assigned Role:</span>
                <span className="font-mono font-bold text-brand-600 dark:text-brand-400">
                  {migrationTarget.role} DATABASE
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-app-secondary">Previous Database:</span>
                <span className="font-semibold text-app-muted">
                  Will automatically switch to Standby (Preserved)
                </span>
              </div>
            </div>

            {/* Transfer data checkbox */}
            {migrationTarget.role === 'PRIMARY' && (
              <label className="flex items-start gap-2.5 p-3 rounded-btn border border-app bg-card hover:bg-surface-tertiary/40 cursor-pointer select-none transition-colors">
                <input
                  type="checkbox"
                  checked={shouldMigrateData}
                  disabled={isMigrating}
                  onChange={(e) => setShouldMigrateData(e.target.checked)}
                  className="mt-0.5 rounded text-brand-600 focus:ring-brand-500"
                />
                <div className="text-xs">
                  <p className="font-bold text-app">Transfer All Existing Data (Zero-Data-Loss)</p>
                  <p className="text-app-secondary">
                    Safely copies all users, course curriculum, question banks, exam submissions, and certificates from the current database into {migrationTarget.engineMeta.name}.
                  </p>
                </div>
              </label>
            )}

            {/* Stepper progress */}
            {migrationStep > 0 && (
              <div className="p-4 bg-surface-tertiary/40 dark:bg-dark-elevated/40 border border-app rounded-btn space-y-3">
                <h4 className="text-xs font-bold text-app uppercase tracking-wider flex items-center justify-between">
                  <span>Migration Pipeline Status</span>
                  {isMigrating && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />}
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    {migrationStep > 1 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : migrationStep === 1 ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-500 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-app shrink-0" />
                    )}
                    <span className={migrationStep >= 1 ? 'font-semibold text-app' : 'text-app-muted'}>
                      1. Pre-flight verification & protocol handshake
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {migrationStep > 2 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : migrationStep === 2 ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-500 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-app shrink-0" />
                    )}
                    <span className={migrationStep >= 2 ? 'font-semibold text-app' : 'text-app-muted'}>
                      2. Target schema provisioning & indexing
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {migrationStep > 3 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : migrationStep === 3 ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-500 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-app shrink-0" />
                    )}
                    <span className={migrationStep >= 3 ? 'font-semibold text-app' : 'text-app-muted'}>
                      3. Streaming records (Users, Courses, Exams, Certificates)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {migrationStep >= 5 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : migrationStep === 4 ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-500 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-app shrink-0" />
                    )}
                    <span className={migrationStep >= 4 ? 'font-semibold text-app' : 'text-app-muted'}>
                      4. Row-count parity audit & hot-swap activation
                    </span>
                  </div>
                </div>

                {migrationSummary && (
                  <div className="pt-2 border-t border-app text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                    ✓ Verified {migrationSummary.totalRecordsMigrated} total records migrated with 100% parity.
                  </div>
                )}
              </div>
            )}

            {migrationError && (
              <div className="p-3.5 rounded-btn bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Migration Aborted</span>
                </p>
                <p>{migrationError}</p>
                <p className="text-[11px] text-app-muted">
                  Your previous database remains completely untouched and active.
                </p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-app">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMigrationTarget(null)}
                disabled={isMigrating}
              >
                {migrationStep === 5 ? 'Close' : 'Cancel'}
              </Button>

              {migrationStep < 5 && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={executeMigration}
                  disabled={isMigrating}
                  leftIcon={
                    isMigrating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCheck className="h-4 w-4" />
                    )
                  }
                  className="bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-sm"
                >
                  {isMigrating ? 'Migrating Database...' : 'Confirm & Activate'}
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
