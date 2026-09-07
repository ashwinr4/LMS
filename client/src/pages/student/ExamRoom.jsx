import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Flag,
  ArrowLeft,
  ArrowRight,
  Send,
  Award,
  Maximize,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function ExamRoom() {
  const { examId } = useParams();
  const navigate = useNavigate();

  // Exam State
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Interaction State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // { [qId]: optionIndex | [optionIndices] }
  const [flagged, setFlagged] = useState({}); // { [qId]: boolean }
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Anti-Cheat Proctoring State
  const [violations, setViolations] = useState([]);
  const [showViolationBanner, setShowViolationBanner] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Result State
  const [submissionResult, setSubmissionResult] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showConfirmSubmitModal, setShowConfirmSubmitModal] = useState(false);

  const timerRef = useRef(null);

  // 1. Initialize Exam Session
  useEffect(() => {
    fetchExamSession();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [examId]);

  const fetchExamSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/assessments/${examId}/start`);
      if (res.data.success) {
        const sess = res.data.session;
        setSession(sess);
        setSecondsRemaining(sess.durationMinutes * 60);
      }
    } catch (err) {
      console.error('Failed to start exam:', err);
      setError(err.response?.data?.message || 'Failed to initialize exam session.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Fullscreen & Anti-Cheat Blur Monitoring
  const enterFullscreen = () => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.warn('Fullscreen request failed:', err);
        });
      }
    } catch (e) {
      console.warn(e);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull && session && !submissionResult) {
        logViolation('FULLSCREEN_EXIT', 'Candidate exited full-screen proctored view.');
      }
    };

    const handleWindowBlur = () => {
      if (session && !submissionResult) {
        logViolation('TAB_SWITCH', 'Candidate switched tabs or focus away from exam.');
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
      return false;
    };

    const handleCopy = (e) => {
      e.preventDefault();
      logViolation('CLIPBOARD_ACCESS', 'Copying exam content is strictly forbidden.');
      return false;
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
    };
  }, [session, submissionResult]);

  const logViolation = (type, message) => {
    setViolations((prev) => {
      const updated = [...prev, { type, message, timestamp: new Date().toISOString() }];
      return updated;
    });
    setShowViolationBanner(true);
    setTimeout(() => setShowViolationBanner(false), 5000);
  };

  // 3. Exam Countdown Timer
  useEffect(() => {
    if (!session || secondsRemaining <= 0 || submissionResult) return;

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [session, submissionResult]);

  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 4. Answer Selection Handling
  const handleSelectOption = (qId, optionIdx, isMultiSelect) => {
    setAnswers((prev) => {
      if (isMultiSelect) {
        const current = Array.isArray(prev[qId]) ? prev[qId] : [];
        const next = current.includes(optionIdx)
          ? current.filter((i) => i !== optionIdx)
          : [...current, optionIdx];
        return { ...prev, [qId]: next };
      } else {
        return { ...prev, [qId]: optionIdx };
      }
    });
  };

  const toggleFlag = (qId) => {
    setFlagged((prev) => ({ ...prev, [qId]: !prev[qId] }));
  };

  // 5. Submit Exam
  const handleAutoSubmit = () => {
    handleSubmitExam(true);
  };

  const handleSubmitExam = async (isAuto = false) => {
    if (isSubmitting || submissionResult) return;
    setIsSubmitting(true);
    setShowConfirmSubmitModal(false);

    try {
      const res = await api.post(`/assessments/${examId}/submit`, {
        answers,
        questionIds: session?.questionIds || [],
        violations,
      });

      if (res.data.success) {
        setSubmissionResult(res.data);
        setShowResultModal(true);

        if (res.data.result?.passed) {
          confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 },
          });
        }
      }
    } catch (err) {
      console.error('Failed to submit exam:', err);
      alert(err.response?.data?.message || 'Error submitting assessment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-app-secondary">Initializing secure proctoring chamber...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 bg-card border border-app rounded-card text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
        <h2 className="text-lg font-bold text-app">Exam Access Denied</h2>
        <p className="text-sm text-app-secondary">{error || 'Unable to load proctored session.'}</p>
        <Button variant="primary" onClick={() => navigate('/assessments')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Back to Assessments
        </Button>
      </div>
    );
  }

  const questions = session.questions || [];
  const currentQ = questions[currentIdx] || null;
  const isMulti = currentQ?.type === 'MULTI_SELECT';
  const answeredCount = Object.keys(answers).length;
  const isTimeCritical = secondsRemaining < 300; // < 5 minutes

  return (
    <div className="min-h-screen bg-surface dark:bg-dark-bg flex flex-col text-app select-none">
      {/* Top Security & Proctoring HUD */}
      <header className="bg-card border-b border-app px-6 py-3 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
            {session.moduleCode}
          </span>
          <div>
            <h1 className="text-sm font-bold truncate max-w-md">{session.title}</h1>
            <p className="text-[11px] text-app-secondary">
              Question {currentIdx + 1} of {questions.length} • {answeredCount} Answered
            </p>
          </div>
        </div>

        {/* HUD Center: Timer & Proctoring Status */}
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-btn font-mono font-bold text-sm transition-colors ${
              isTimeCritical
                ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 animate-pulse'
                : 'bg-surface-tertiary dark:bg-dark-elevated text-app border border-app'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>{formatTimer(secondsRemaining)}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-btn text-xs font-semibold ${
              violations.length === 0
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{violations.length} Violations</span>
          </div>

          {!isFullscreen && (
            <Button
              variant="outline"
              size="xs"
              onClick={enterFullscreen}
              leftIcon={<Maximize className="h-3 w-3" />}
              className="text-[11px]"
            >
              Full Screen
            </Button>
          )}
        </div>

        {/* HUD Right: Submit Action */}
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowConfirmSubmitModal(true)}
          leftIcon={<Send className="h-3.5 w-3.5" />}
          disabled={isSubmitting}
        >
          Submit Exam
        </Button>
      </header>

      {/* Proctoring Warning Banner */}
      {showViolationBanner && (
        <div className="bg-red-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-md transition-all animate-bounce">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            <span>
              <strong>Security Alert:</strong> Focus loss or tab change detected. All actions are logged to your permanent audit record.
            </span>
          </div>
          <button onClick={() => setShowViolationBanner(false)} className="text-white/80 hover:text-white text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Exam Room Body */}
      <div className="flex-1 max-w-5xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left 3 cols: Question Area */}
        <div className="lg:col-span-3 space-y-6">
          {currentQ && (
            <div className="bg-card border border-app rounded-card p-6 space-y-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 border-b border-app">
                <span className="text-xs font-bold text-app-secondary uppercase tracking-wider">
                  Question {currentIdx + 1} ({currentQ.points || 1} Point{currentQ.points > 1 ? 's' : ''})
                </span>
                <button
                  onClick={() => toggleFlag(currentQ.id)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-btn transition-colors ${
                    flagged[currentQ.id]
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'text-app-secondary hover:text-app hover:bg-surface-tertiary'
                  }`}
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>{flagged[currentQ.id] ? 'Flagged for Review' : 'Flag for Review'}</span>
                </button>
              </div>

              {/* Question Text */}
              <div className="text-base font-semibold text-app leading-relaxed">{currentQ.text}</div>

              {isMulti && (
                <div className="text-xs text-brand-600 dark:text-brand-400 font-medium">
                  * Select all correct options that apply.
                </div>
              )}

              {/* Options */}
              <div className="space-y-3 pt-2">
                {(currentQ.options || []).map((option, idx) => {
                  const selectedVal = answers[currentQ.id];
                  const isSelected = isMulti
                    ? Array.isArray(selectedVal) && selectedVal.includes(idx)
                    : selectedVal === idx;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectOption(currentQ.id, idx, isMulti)}
                      className={`w-full text-left p-4 rounded-card border text-sm font-medium transition-all flex items-start gap-3.5 ${
                        isSelected
                          ? 'border-brand-500 bg-brand-500/[0.08] text-brand-700 dark:text-brand-300 font-bold shadow-sm'
                          : 'border-app bg-card hover:bg-surface-tertiary/60 dark:hover:bg-dark-elevated text-app'
                      }`}
                    >
                      <span
                        className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-mono shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-brand-500 text-white font-bold'
                            : 'bg-surface-tertiary dark:bg-dark-elevated text-app-secondary'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="flex-1 pt-0.5">{option}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
              disabled={currentIdx === 0}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Previous
            </Button>

            {currentIdx < questions.length - 1 ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => setCurrentIdx((prev) => Math.min(questions.length - 1, prev + 1))}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Next Question
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={() => setShowConfirmSubmitModal(true)}
                rightIcon={<Send className="h-4 w-4" />}
              >
                Review & Submit
              </Button>
            )}
          </div>
        </div>

        {/* Right 1 col: Question Palette Navigator */}
        <div className="space-y-6">
          <div className="bg-card border border-app rounded-card p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-secondary">Question Palette</h3>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isAnswered = answers[q.id] !== undefined && (Array.isArray(answers[q.id]) ? answers[q.id].length > 0 : true);
                const isFlagged = flagged[q.id];
                const isCurrent = currentIdx === idx;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIdx(idx)}
                    className={`h-9 rounded-btn text-xs font-mono font-bold transition-all relative flex items-center justify-center ${
                      isCurrent
                        ? 'ring-2 ring-brand-500 bg-brand-500 text-white'
                        : isAnswered
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold'
                        : 'bg-surface-tertiary dark:bg-dark-elevated text-app-secondary hover:text-app'
                    }`}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 border-2 border-card" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="pt-3 border-t border-app space-y-1.5 text-[11px] text-app-secondary font-medium">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-500/40 border border-emerald-500" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-surface-tertiary border border-app" />
                <span>Unanswered ({questions.length - answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-amber-500" />
                <span>Flagged for Review ({Object.values(flagged).filter(Boolean).length})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmSubmitModal}
        onClose={() => setShowConfirmSubmitModal(false)}
        title="Ready to Submit Exam?"
      >
        <div className="space-y-4 text-sm">
          <p className="text-app-secondary">
            You have answered <strong className="text-app">{answeredCount}</strong> of{' '}
            <strong className="text-app">{questions.length}</strong> questions.
            {questions.length - answeredCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400 block mt-1">
                ⚠️ Warning: You have {questions.length - answeredCount} unanswered questions which will be marked as incorrect.
              </span>
            )}
          </p>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-app">
            <Button variant="secondary" onClick={() => setShowConfirmSubmitModal(false)}>
              Keep Answering
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSubmitExam(false)}
              disabled={isSubmitting}
              leftIcon={<Send className="h-4 w-4" />}
            >
              {isSubmitting ? 'Grading Assessment...' : 'Confirm & Grade'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Exam Result & Certificate Modal */}
      {submissionResult && (
        <Modal
          isOpen={showResultModal}
          onClose={() => navigate('/assessments')}
          title="Exam Evaluation & Score Report"
        >
          <div className="space-y-6 text-sm">
            <div
              className={`p-6 rounded-card text-center space-y-3 ${
                submissionResult.result?.passed
                  ? 'bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-500/10 border-2 border-red-500/30 text-red-700 dark:text-red-300'
              }`}
            >
              {submissionResult.result?.passed ? (
                <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
              ) : (
                <XCircle className="h-12 w-12 mx-auto text-red-500" />
              )}

              <div>
                <h3 className="text-xl font-bold">
                  {submissionResult.result?.passed ? 'PASSED & CERTIFIED' : 'PASSING THRESHOLD NOT MET'}
                </h3>
                <p className="text-xs opacity-90 mt-1">
                  Score Achieved:{' '}
                  <span className="text-2xl font-black font-mono">{submissionResult.result?.score}%</span>{' '}
                  (Required: {submissionResult.result?.passingScore}%)
                </p>
              </div>
            </div>

            {/* Cryptographic Certificate Issuance Card */}
            {submissionResult.certificate && (
              <div className="bg-brand-500/10 border-2 border-teal-500/30 rounded-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-xs">
                  <Award className="h-4 w-4" />
                  <span>Cryptographic Graduation Certificate Issued</span>
                </div>
                <div className="text-xs font-mono text-app-secondary">
                  Certificate Code:{' '}
                  <span className="font-bold text-app">{submissionResult.certificate.code}</span>
                </div>
                <div className="text-[11px] font-mono text-app-muted truncate">
                  SHA-256: {submissionResult.certificate.verificationHash}
                </div>
              </div>
            )}

            {/* Question Breakdown List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-app-secondary">
                Detailed Answers Breakdown
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {(submissionResult.result?.gradedAnswers || []).map((ga, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-btn border text-xs space-y-1 ${
                      ga.isCorrect
                        ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                        : 'border-red-500/20 bg-red-500/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span>Question {idx + 1}</span>
                      <span className={ga.isCorrect ? 'text-emerald-600' : 'text-red-500'}>
                        {ga.isCorrect ? `+${ga.points} Pts (Correct)` : '0 Pts (Incorrect)'}
                      </span>
                    </div>
                    <p className="text-app-secondary">{ga.questionText}</p>
                    {ga.explanation && (
                      <p className="text-[11px] text-app-muted italic">Explanation: {ga.explanation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Navigation */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-app">
              <Button variant="secondary" onClick={() => navigate('/assessments')}>
                Back to Assessments
              </Button>
              {submissionResult.certificate && (
                <Button
                  variant="primary"
                  onClick={() => navigate('/certificates')}
                  leftIcon={<Award className="h-4 w-4" />}
                >
                  View My Certificate
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
