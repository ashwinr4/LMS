import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Award,
  Layers,
  FileCheck2,
  Sparkles,
} from 'lucide-react';

export default function ModeratorCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/moderator/courses');
      if (res.data.success) {
        setCourses(res.data.courses || []);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load course quality queue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Course Quality & Compliance Review"
        description="Inspect course curriculum completeness, verify learning outcomes, and ensure proctored assessment coverage before enterprise rollout."
        badge={<StatusBadge status="ACTIVE" label="Quality Gate Active" size="xs" />}
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-card border border-app rounded-card animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-red-500/10 border border-red-500/30 rounded-card text-xs text-red-600 font-semibold">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((c) => {
            const isHighQuality = c.qualityScore >= 80;
            return (
              <div
                key={c.id}
                className="bg-card border border-app rounded-card p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-sm hover:shadow-md transition-all"
              >
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
                      {c.code}
                    </span>
                    <StatusBadge status={c.status} size="xs" />
                    <span className="text-xs text-app-secondary">• {c.department}</span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-app">{c.title}</h3>
                    <p className="text-xs text-app-secondary mt-0.5">
                      Author / Faculty: {c.instructorName || 'Enterprise Creator'}
                    </p>
                  </div>

                  {/* Quality Checklist */}
                  <div className="grid sm:grid-cols-3 gap-2 pt-1">
                    <div className="flex items-center gap-1.5 text-xs text-app-secondary">
                      {c.totalSections > 0 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      )}
                      <span>{c.totalSections} Curriculum Sections</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-app-secondary">
                      {c.totalLessons >= 3 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span>{c.totalLessons} Lessons (≥3 recommended)</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-app-secondary">
                      {c.hasAssessment ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      )}
                      <span>
                        {c.hasAssessment ? 'Proctored Exam Configured' : 'Missing Assessment Exam'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quality Score Badge */}
                <div className="flex flex-col items-start lg:items-end justify-center gap-1 shrink-0 p-4 rounded-card bg-surface-tertiary/60 dark:bg-dark-elevated/40 border border-app min-w-[160px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-app-secondary">
                    Compliance Score
                  </span>
                  <div className="text-2xl font-mono font-black text-app flex items-center gap-1.5">
                    <Award
                      className={`h-5 w-5 ${
                        isHighQuality ? 'text-teal-500' : 'text-amber-500'
                      }`}
                    />
                    <span className={isHighQuality ? 'text-teal-600 dark:text-teal-400' : 'text-amber-600'}>
                      {c.qualityScore}%
                    </span>
                  </div>
                  <span className="text-[10px] text-app-muted">
                    {isHighQuality ? 'Ready for Deployment' : 'Requires Content Polish'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
