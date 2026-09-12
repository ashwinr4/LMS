import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { CustomDropdown } from '../../components/ui/CustomDropdown.jsx';
import {
  ShieldAlert,
  Search,
  AlertTriangle,
  Clock,
  User,
  Activity,
  Filter,
  RefreshCw,
  Terminal,
} from 'lucide-react';

const RISK_OPTIONS = [
  { value: 'ALL', label: 'All Risks' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
];

function formatAuditDetails(log) {
  if (!log?.details) return '—';
  try {
    let parsed = log.details;
    if (typeof parsed === 'string' && (parsed.trim().startsWith('{') || parsed.trim().startsWith('['))) {
      parsed = JSON.parse(parsed);
    }
    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.summary) {
        return parsed.summary;
      }
      if (parsed.module && parsed.actionType) {
        const state = parsed.current !== undefined ? (parsed.current ? 'Enabled' : 'Disabled') : '';
        const capAction = parsed.actionType.charAt(0).toUpperCase() + parsed.actionType.slice(1);
        const capModule = parsed.module.charAt(0).toUpperCase() + parsed.module.slice(1);
        return `${state ? state + ' ' : ''}${capAction} permission on ${capModule} module`;
      }
      if (parsed.role) {
        return `Role changed to ${parsed.role}`;
      }
      if (parsed.status) {
        return `Status updated to ${parsed.status}`;
      }
      const entries = Object.entries(parsed).filter(
        ([k]) => !['userId', 'id', 'actorId', 'token', 'hash'].includes(k)
      );
      if (entries.length > 0) {
        return entries
          .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(' • ');
      }
    }
  } catch (_) {
    // Fall back to original plain string
  }
  return log.details;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedRisk, setSelectedRisk] = useState('ALL');

  useEffect(() => {
    fetchLogs();
  }, [selectedRisk]);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        riskLevel: selectedRisk,
        search: search.trim() || undefined,
      };
      const res = await api.get('/admin/audit-logs', { params });
      if (res.data.success) {
        setLogs(res.data.logs || []);
        setStats(res.data.stats || null);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      setError(err.response?.data?.message || 'Failed to fetch audit logs.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLogs();
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Immutable Security & Audit Trail"
        description="Append-only cryptographic event ledger tracking all user authentications, administrative RBAC changes, course lifecycle triggers, and exam anti-cheat violations."
        badge={
          <StatusBadge
            status={stats?.high > 0 ? 'SUSPENDED' : 'ACTIVE'}
            label={stats?.high > 0 ? `${stats.high} High-Risk Alerts` : 'Audit Trail Verified'}
            size="xs"
          />
        }
      />

      {/* Filters & Search Toolbar */}
      <div className="bg-card border border-app rounded-card p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-80">
          <Input
            placeholder="Search action, actor, or details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            className="text-xs h-9"
          />
          <Button type="submit" variant="secondary" size="xs" className="h-9 px-3">
            Search
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          {/* Dynamic Filter Event Count Indicator */}
          <span className="text-xs text-app-secondary">
            {search.trim() ? (
              <>Showing <strong className="text-app font-semibold">{logs.length}</strong> matching events</>
            ) : selectedRisk === 'HIGH' ? (
              <>Showing <strong className="text-red-500 font-semibold">{stats?.high ?? logs.length}</strong> High Risk Alerts</>
            ) : selectedRisk === 'MEDIUM' ? (
              <>Showing <strong className="text-amber-500 font-semibold">{stats?.medium ?? logs.length}</strong> Medium Risk Events</>
            ) : selectedRisk === 'LOW' ? (
              <>Showing <strong className="text-emerald-500 font-semibold">{stats?.low ?? logs.length}</strong> Low Risk Events</>
            ) : (
              <>Showing <strong className="text-app font-semibold">{stats?.total ?? logs.length}</strong> Total Events</>
            )}
          </span>

          {/* Clean Dropdown Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-app-secondary">
              Risk:
            </span>
            <CustomDropdown
              id="risk-filter"
              aria-label="Filter by Risk"
              value={selectedRisk}
              onChange={setSelectedRisk}
              options={RISK_OPTIONS}
              className="w-36"
            />
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-card border border-app rounded-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-surface-tertiary rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center bg-red-500/10 border border-red-500/30 rounded-card text-xs text-red-600 font-semibold">
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Terminal className="h-10 w-10 text-app-muted mx-auto" />
            <h4 className="text-sm font-bold text-app">No Audit Records Found</h4>
            <p className="text-xs text-app-secondary">Adjust search filters to view security history.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-app bg-surface-tertiary/40 dark:bg-dark-elevated/20 text-app-secondary uppercase font-bold text-[10px] tracking-wider">
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Actor</th>
                  <th className="py-3.5 px-4">Target Resource</th>
                  <th className="py-3.5 px-4">Details</th>
                  <th className="py-3.5 px-4 text-right">Risk Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-tertiary/30 transition-colors">
                    {/* Timestamp */}
                    <td className="py-3.5 px-4 font-mono text-[11px] text-app-secondary whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>

                    {/* Actor */}
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-sm text-app">{log.actorName || 'System'}</p>
                      <p className="text-xs font-mono text-app-muted">{log.actorEmail || 'daemon'}</p>
                    </td>

                    {/* Target Resource */}
                    <td className="py-3.5 px-4 font-medium text-app max-w-xs truncate">
                      {log.resource || '—'}
                    </td>

                    {/* Details */}
                    <td className="py-3.5 px-4 text-app-secondary max-w-md truncate" title={typeof log.details === 'string' ? log.details : ''}>
                      {formatAuditDetails(log)}
                    </td>

                    {/* Humanized Risk Level */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <span
                        className={`text-xs ${
                          log.riskLevel === 'HIGH'
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : log.riskLevel === 'MEDIUM'
                            ? 'text-amber-600 dark:text-amber-400 font-medium'
                            : 'text-emerald-600 dark:text-emerald-400 font-medium'
                        }`}
                      >
                        {log.riskLevel === 'HIGH' ? 'High' : log.riskLevel === 'MEDIUM' ? 'Medium' : 'Low'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
