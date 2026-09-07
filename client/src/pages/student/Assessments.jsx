import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import {
  FileCheck2,
  Clock,
  Lock,
  Play,
  Award,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  Eye,
} from 'lucide-react';

export default function Assessments() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);
  const [showConsentModal, setShowConsentModal] = useState(false);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/assessments/my-exams');
      if (res.data.success) {
        setExams(res.data.exams || []);
      }
    } catch (err) {
      console.error('Failed to load exams:', err);
      setError(err.response?.data?.message || 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  const handleStartExam = (exam) => {
    setSelectedExam(exam);
    setShowConsentModal(true);
  };

  const handleLaunchSession = () => {
    if (!selectedExam) return;
    setShowConsentModal(false);
    navigate(`/assessments/${selectedExam.id}/room`);
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Assessments & Proctored Exams"
        description="Comprehensive anti-cheat proctored assessments. Complete required curriculum lessons (≥80% progress) to unlock official certification exams."
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-card border border-app rounded-card p-6 animate-pulse space-y-4">
              <div className="h-4 bg-surface-tertiary rounded w-1/4" />
              <div className="h-6 bg-surface-tertiary rounded w-2/3" />
              <div className="h-4 bg-surface-tertiary rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-card text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchExams}>
            Try Again
          </Button>
        </div>
      ) : exams.length === 0 ? (
        <div className="p-12 bg-card border border-app rounded-card text-center space-y-4">
          <BookOpen className="h-12 w-12 text-app-muted mx-auto" />
          <h3 className="text-base font-bold text-app">No Enrolled Courses Found</h3>
          <p className="text-sm text-app-secondary max-w-md mx-auto">
            You must be enrolled in course modules with assessments to participate in proctored examinations.
          </p>
          <Button variant="primary" onClick={() => navigate('/courses')} leftIcon={<BookOpen className="h-4 w-4" />}>
            Explore Course Catalog
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {exams.map((exam) => {
            const hasPassed = exam.lastSubmission?.passed || !!exam.certificate;
            const score = exam.lastSubmission?.score || exam.certificate?.scoreAchieved;

            return (
              <div
                key={exam.id}
                className={`bg-card border rounded-card p-6 transition-all duration-200 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-sm ${
                  hasPassed
                    ? 'border-emerald-500/30 bg-emerald-500/[0.02]'
                    : exam.isUnlocked
                    ? 'border-brand-500/30 hover:border-brand-500/60 shadow-md'
                    : 'border-app opacity-75'
                }`}
              >
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded border border-brand-500/20">
                      {exam.moduleCode}
                    </span>
                    <span className="text-xs text-app-secondary font-medium">• {exam.moduleTitle}</span>
                    {hasPassed ? (
                      <StatusBadge status="COMPLETED" label="Certified" size="xs" />
                    ) : exam.isUnlocked ? (
                      <StatusBadge status="ACTIVE" label="Ready to Take" size="xs" />
                    ) : (
                      <StatusBadge status="EXPIRED" label="Locked (Course < 80%)" size="xs" />
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-app">{exam.title}</h3>
                    {exam.description && (
                      <p className="text-xs text-app-secondary mt-1 max-w-3xl leading-relaxed">{exam.description}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-app-secondary font-medium">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-brand-500" />
                      <span>{exam.durationMinutes} Minutes Time Limit</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FileCheck2 className="h-3.5 w-3.5 text-brand-500" />
                      <span>
                        {exam.sampleSize} Questions sampled (from {exam.questionCount})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-teal-500" />
                      <span>{exam.passingScore}% Pass Threshold</span>
                    </div>
                  </div>

                  {!exam.isUnlocked && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-btn w-fit">
                      <Lock className="h-3.5 w-3.5" />
                      <span>Course Progress: {exam.courseProgress}% (80% required to unlock)</span>
                    </div>
                  )}

                  {hasPassed && (
                    <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-btn w-fit font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Score Achieved: {score}% • Cryptographic Certificate Issued</span>
                    </div>
                  )}
                </div>

                {/* Action CTA */}
                <div className="flex flex-col sm:flex-row lg:flex-col items-stretch lg:items-end justify-center gap-2.5 shrink-0 min-w-[200px]">
                  {hasPassed ? (
                    <>
                      <Button
                        variant="primary"
                        size="md"
                        leftIcon={<Award className="h-4 w-4" />}
                        onClick={() => navigate('/certificates')}
                        className="w-full"
                      >
                        View Certificate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Eye className="h-3.5 w-3.5" />}
                        onClick={() => handleStartExam(exam)}
                        className="w-full"
                      >
                        Retake Exam
                      </Button>
                    </>
                  ) : exam.isUnlocked ? (
                    <Button
                      variant="primary"
                      size="md"
                      leftIcon={<Play className="h-4 w-4" />}
                      onClick={() => handleStartExam(exam)}
                      className="w-full shadow-md"
                    >
                      Start Proctored Exam
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="md"
                      leftIcon={<Lock className="h-4 w-4" />}
                      disabled
                      className="w-full opacity-60"
                    >
                      Complete Lessons to Unlock
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Proctored Exam Launch Confirmation Modal */}
      {selectedExam && (
        <Modal
          isOpen={showConsentModal}
          onClose={() => setShowConsentModal(false)}
          title="Anti-Cheat Proctored Exam Briefing"
        >
          <div className="space-y-5 text-sm">
            <div className="p-4 bg-brand-500/10 border border-brand-500/20 rounded-btn space-y-2">
              <h4 className="font-bold text-brand-700 dark:text-brand-300 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                {selectedExam.title}
              </h4>
              <p className="text-xs text-app-secondary">
                Module: <span className="font-mono font-bold">{selectedExam.moduleCode}</span> • Passing Score:{' '}
                <span className="font-bold">{selectedExam.passingScore}%</span> • Time:{' '}
                <span className="font-bold">{selectedExam.durationMinutes} mins</span>
              </p>
            </div>

            <div className="space-y-3">
              <h5 className="font-semibold text-xs uppercase tracking-wider text-app-secondary">
                Proctoring Rules & Security Protocol:
              </h5>
              <ul className="space-y-2 text-xs text-app-secondary">
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                  <span>
                    <strong>Fullscreen Enforcement:</strong> The exam runs in a locked full-screen proctored session.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                  <span>
                    <strong>Tab & Blur Tracking:</strong> Switching browser tabs or windows is logged as a security violation.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                  <span>
                    <strong>Auto-Grading & Certificate:</strong> Scoring {selectedExam.passingScore}% or higher generates an immutable SHA-256 graduation certificate.
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-app">
              <Button variant="secondary" onClick={() => setShowConsentModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleLaunchSession} rightIcon={<ArrowRight className="h-4 w-4" />}>
                I Understand, Start Exam
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
