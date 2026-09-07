import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Button } from '../../components/ui/Button.jsx';
import {
  Users,
  Search,
  Building2,
  Calendar,
  AlertCircle,
} from 'lucide-react';

export default function ModeratorUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('ALL');

  useEffect(() => {
    fetchUsers();
  }, [selectedRole]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        role: selectedRole !== 'ALL' ? selectedRole : undefined,
        search: search.trim() || undefined,
      };
      const res = await api.get('/moderator/users', { params });
      if (res.data.success) {
        setUsers(res.data.users || []);
      }
    } catch (err) {
      console.error('Failed to load moderator users:', err);
      setError(err.response?.data?.message || 'Failed to load user directory.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchUsers();
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Enterprise User Directory (Read-Only)"
        description="Auditing view for Moderators. Inspect enterprise member profiles, organizational departments, and account status."
        badge={<StatusBadge status="ACTIVE" label="Auditor Mode" size="xs" />}
      />

      {/* Filter & Search Bar */}
      <div className="bg-card border border-app rounded-card p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-80">
          <Input
            placeholder="Search by name, email, or dept..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            className="text-xs h-9"
          />
          <Button type="submit" variant="secondary" size="xs" className="h-9 px-3">
            Search
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5 self-start md:self-auto text-xs">
          {['ALL', 'USER', 'COURSE_CREATOR', 'MODERATOR', 'ADMIN'].map((r) => (
            <button
              key={r}
              onClick={() => setSelectedRole(r)}
              className={`px-3 py-1.5 rounded-btn font-semibold transition-all ${
                selectedRole === r
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-surface-tertiary dark:bg-dark-elevated text-app-secondary hover:text-app'
              }`}
            >
              {r === 'ALL' ? 'All Roles' : r === 'COURSE_CREATOR' ? 'Creator' : r}
            </button>
          ))}
        </div>
      </div>

      {/* User Table */}
      <div className="bg-card border border-app rounded-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-surface-tertiary rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center bg-red-500/10 border border-red-500/30 rounded-card text-xs text-red-600 font-semibold">
            {error}
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users className="h-10 w-10 text-app-muted mx-auto" />
            <h4 className="text-sm font-bold text-app">No Users Found</h4>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-app bg-surface-tertiary/40 dark:bg-dark-elevated/20 text-app-secondary uppercase font-bold text-[10px] tracking-wider">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Department & Location</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-tertiary/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-xs shrink-0">
                          {u.name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-app">{u.name}</p>
                          <p className="text-app-secondary font-mono text-[11px]">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <p className="font-medium text-app">{u.department || 'General'}</p>
                      <p className="text-[10px] text-app-secondary">{u.location || 'Remote'}</p>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold">
                      <span className="bg-surface-tertiary px-2 py-0.5 rounded text-[10px] text-app-secondary">
                        {u.role}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <StatusBadge status={u.status} size="xs" />
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-[11px] text-app-secondary">
                      {new Date(u.createdAt).toLocaleDateString()}
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
