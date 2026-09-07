import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import {
  Database, Server, CheckCircle2, AlertTriangle,
  RefreshCw, Eye, EyeOff, Activity, Check, AlertCircle, Info,
} from 'lucide-react';

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Connection Strings State
  const [primaryUrl, setPrimaryUrl] = useState('');
  const [backupUrl, setBackupUrl] = useState('');
  const [showPrimaryPassword, setShowPrimaryPassword] = useState(false);
  const [showBackupPassword, setShowBackupPassword] = useState(false);

  // Connection Test States
  const [testingPrimary, setTestingPrimary] = useState(false);
  const [primaryTestResult, setPrimaryTestResult] = useState(null);

  const [testingBackup, setTestingBackup] = useState(false);
  const [backupTestResult, setBackupTestResult] = useState(null);

  // Info Modal State ('primary' | 'secondary' | null)
  const [infoModal, setInfoModal] = useState(null);

  // Save Confirmation Dialog State
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Fetch current database configuration
  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/settings/database');
      if (data.settings) {
        setPrimaryUrl(data.settings.primary?.rawUrl || '');
        setBackupUrl(data.settings.secondary?.rawUrl || '');
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

  // Test connection utility
  const handleTestConnection = async (type) => {
    const targetUrl = type === 'primary' ? primaryUrl : backupUrl;
    if (!targetUrl) return;

    if (type === 'primary') {
      setTestingPrimary(true);
      setPrimaryTestResult(null);
    } else {
      setTestingBackup(true);
      setBackupTestResult(null);
    }

    try {
      const { data } = await api.post('/admin/settings/database/test', {
        url: targetUrl.trim(),
      });

      const result = {
        success: true,
        message: data.message,
        latencyMs: data.latencyMs,
        version: data.version,
        databaseName: data.databaseName,
      };

      if (type === 'primary') setPrimaryTestResult(result);
      else setBackupTestResult(result);
    } catch (err) {
      const result = {
        success: false,
        message: err.response?.data?.message || 'Connection test failed.',
      };
      if (type === 'primary') setPrimaryTestResult(result);
      else setBackupTestResult(result);
    } finally {
      if (type === 'primary') setTestingPrimary(false);
      else setTestingBackup(false);
    }
  };

  // Commit updated configuration
  const handleConfirmSave = async () => {
    setShowConfirmModal(false);
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.put('/admin/settings/database', {
        primaryUrl: primaryUrl.trim(),
        backupUrl: backupUrl.trim(),
      });

      setSuccess('Database configuration updated successfully.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error('Failed to update database settings:', err);
      setError(err.response?.data?.message || 'Failed to update database settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in pb-16">
      <PageHeader
        title="Database Settings"
        description="Configure Primary and Secondary database endpoints."
      />

      {success && (
        <div className="p-4 rounded-card bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3 text-emerald-800 dark:text-emerald-300 text-sm animate-fade-in shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-card bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center gap-3 text-red-800 dark:text-red-300 text-sm animate-fade-in shadow-sm">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── 1. PRIMARY DATABASE ──────────────── */}
      <div className="p-6 bg-card border border-app rounded-card shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-app">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h2 className="text-sm font-bold text-app">Primary Database</h2>
            <button
              type="button"
              onClick={() => setInfoModal('primary')}
              className="p-1 rounded-full text-app-muted hover:text-brand-600 dark:hover:text-brand-400 hover:bg-elevated transition-colors"
              title="View Primary Database details"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-app">
            Database URL
          </label>
          <div className="relative">
            <input
              type={showPrimaryPassword ? 'text' : 'password'}
              value={primaryUrl}
              onChange={(e) => {
                setPrimaryUrl(e.target.value);
                setPrimaryTestResult(null);
              }}
              placeholder="postgresql://..."
              className="w-full px-3.5 py-2.5 pr-12 rounded-btn border border-app bg-surface dark:bg-dark-surface text-app font-mono text-xs focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
            />
            <button
              type="button"
              onClick={() => setShowPrimaryPassword((p) => !p)}
              className="absolute right-3 top-2.5 text-app-muted hover:text-app"
            >
              {showPrimaryPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              isLoading={testingPrimary}
              onClick={() => handleTestConnection('primary')}
              leftIcon={<Activity className="h-3.5 w-3.5" />}
            >
              Test Connection
            </Button>

            {primaryTestResult && (
              <div
                className={`px-3 py-1.5 rounded-btn text-xs font-medium flex items-center gap-2 border ${
                  primaryTestResult.success
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-800'
                }`}
              >
                {primaryTestResult.success ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Connected ({primaryTestResult.latencyMs}ms)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                    <span>{primaryTestResult.message}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. SECONDARY DATABASE ─────────────── */}
      <div className="p-6 bg-card border border-app rounded-card shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-app">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-app">Secondary Database</h2>
            <button
              type="button"
              onClick={() => setInfoModal('secondary')}
              className="p-1 rounded-full text-app-muted hover:text-indigo-500 hover:bg-elevated transition-colors"
              title="View Secondary Database details"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-app">
            Database URL
          </label>
          <div className="relative">
            <input
              type={showBackupPassword ? 'text' : 'password'}
              value={backupUrl}
              onChange={(e) => {
                setBackupUrl(e.target.value);
                setBackupTestResult(null);
              }}
              placeholder="postgresql://..."
              className="w-full px-3.5 py-2.5 pr-12 rounded-btn border border-app bg-surface dark:bg-dark-surface text-app font-mono text-xs focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
            />
            <button
              type="button"
              onClick={() => setShowBackupPassword((p) => !p)}
              className="absolute right-3 top-2.5 text-app-muted hover:text-app"
            >
              {showBackupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              isLoading={testingBackup}
              onClick={() => handleTestConnection('backup')}
              leftIcon={<Activity className="h-3.5 w-3.5" />}
            >
              Test Connection
            </Button>

            {backupTestResult && (
              <div
                className={`px-3 py-1.5 rounded-btn text-xs font-medium flex items-center gap-2 border ${
                  backupTestResult.success
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-800'
                }`}
              >
                {backupTestResult.success ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Connected ({backupTestResult.latencyMs}ms)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                    <span>{backupTestResult.message}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. SAVE ACTIONS ──────────────────── */}
      <div className="p-4 bg-elevated border border-app rounded-card flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={fetchSettings}
          disabled={saving}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Reset
        </Button>

        <Button
          type="button"
          isLoading={saving}
          onClick={() => setShowConfirmModal(true)}
          leftIcon={<CheckCircle2 className="h-4 w-4" />}
          className="bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-sm"
        >
          Save Database Settings
        </Button>
      </div>

      {/* ── PRIMARY DATABASE INFO MODAL ─────────────── */}
      <Modal
        isOpen={infoModal === 'primary'}
        onClose={() => setInfoModal(null)}
        title="Primary Database Information"
      >
        <div className="space-y-4 text-xs text-app-secondary leading-relaxed pt-2">
          <div>
            <h4 className="font-semibold text-app text-sm mb-1">Operational Role</h4>
            <p>
              The primary database is the active production instance. It serves all real-time application traffic, including user authentications, course enrollments, lecture progress, and exam submissions.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-app text-sm mb-1">Connection Pool</h4>
            <p>
              Allocated 20 persistent connections (<code className="font-mono text-app">max: 20</code>) with automatic keep-alive checks to eliminate connection latency for concurrent users.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-app text-sm mb-1">Expected Format</h4>
            <p className="font-mono text-[11px] p-2 bg-elevated border border-app rounded text-app break-all">
              postgresql://[user]:[password]@[host]:[port]/[database]?sslmode=require
            </p>
          </div>
        </div>
      </Modal>

      {/* ── SECONDARY DATABASE INFO MODAL ───────────── */}
      <Modal
        isOpen={infoModal === 'secondary'}
        onClose={() => setInfoModal(null)}
        title="Secondary Database Information"
      >
        <div className="space-y-4 text-xs text-app-secondary leading-relaxed pt-2">
          <div>
            <h4 className="font-semibold text-app text-sm mb-1">Operational Role</h4>
            <p>
              The secondary database acts as a hot standby instance for data backup and disaster recovery. Changes are replicated asynchronously in the background so that student actions are never delayed by backup operations.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-app text-sm mb-1">Connection Pool & Failover</h4>
            <p>
              Allocated 10 connections (<code className="font-mono text-app">max: 10</code>). In the event of a primary database outage, this standby instance can be designated as the new Primary database to resume services without data loss.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-app text-sm mb-1">Cluster Synchronization</h4>
            <p>
              If this URL is identical to the Primary Database URL, the application operates as a single unified cloud cluster and avoids redundant writes.
            </p>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal */}
      <ConfirmDialog
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        title="Update Database Configuration?"
        message="Are you sure you want to update the database configuration?"
        confirmText="Confirm & Save"
        variant="warning"
      />
    </div>
  );
}
