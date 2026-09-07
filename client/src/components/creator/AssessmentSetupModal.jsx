import { useState, useRef } from 'react';
import { api } from '../../services/api.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import {
  UploadCloud, FileText, CheckCircle2, AlertCircle, Trash2,
  Clock, Award, Layers, ShieldCheck, ShieldAlert, Edit2, Check,
  ChevronUp, ChevronDown,
} from 'lucide-react';

export function AssessmentSetupModal({
  isOpen,
  onClose,
  moduleId,
  sectionId = null,
  sectionTitle = '',
  isFinalExam = false,
  existingAssessment = null,
  onSaved,
}) {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState(1); // 1: Upload, 2: Review Questions, 3: Configure Rules
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [securityMessage, setSecurityMessage] = useState(null);

  // Form State
  const [title, setTitle] = useState(
    existingAssessment?.title ||
    (isFinalExam ? 'Final Comprehensive Course Examination' : `${sectionTitle} Knowledge Check`)
  );
  const [passingScore, setPassingScore] = useState(existingAssessment?.passingScore || 80);
  const [sampleSize, setSampleSize] = useState(existingAssessment?.sampleSize || 10);
  const [durationMinutes, setDurationMinutes] = useState(existingAssessment?.durationMinutes || 30);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [questions, setQuestions] = useState(
    existingAssessment?.questions ? (typeof existingAssessment.questions === 'string' ? JSON.parse(existingAssessment.questions) : existingAssessment.questions) : []
  );

  // Handle Document Upload & Security Scan
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSecurityMessage(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post('/assessments/extract', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (data.success) {
        setUploadedFileName(data.filename);
        setQuestions(data.questions);
        setSampleSize(Math.min(data.questions.length, 10));
        setSecurityMessage('Security Verification Passed: Clean document free of macros and scripts.');
        setStep(2); // Proceed to interactive question review
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Failed to extract questions from document.';
      setError(errMsg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Toggle correct option for a question
  const handleSetCorrectOption = (qIndex, optIndex) => {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === qIndex ? { ...q, correctOption: optIndex } : q))
    );
  };

  // Update question text
  const handleUpdateQuestionText = (qIndex, newText) => {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === qIndex ? { ...q, questionText: newText } : q))
    );
  };

  // Remove a question
  const handleRemoveQuestion = (qIndex) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== qIndex));
  };

  // Save assessment to database
  const handleSave = async () => {
    if (!title.trim()) {
      setError('Please provide a test title.');
      return;
    }
    if (questions.length === 0) {
      setError('Please upload or provide at least one valid question.');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      moduleId,
      title,
      description: isFinalExam ? 'FINAL_EXAM' : (sectionId ? `SECTION_TEST:${sectionId}` : 'ASSESSMENT'),
      passingScore: Number(passingScore) || 80,
      sampleSize: Math.min(Number(sampleSize) || 10, questions.length),
      durationMinutes: Number(durationMinutes) || 30,
      randomizeQuestions: true,
      questions: questions.map((q, idx) => ({
        id: q.id || `q_${idx + 1}`,
        order: idx,
        text: q.questionText || q.text,
        type: 'MCQ',
        options: q.options || [],
        correctAnswer: q.correctOption !== undefined ? q.correctOption : 0,
        explanation: q.explanation || '',
        points: 1,
      })),
    };

    try {
      let data;
      if (existingAssessment?.id) {
        ({ data } = await api.put(`/assessments/${existingAssessment.id}`, payload));
      } else {
        ({ data } = await api.post('/assessments', payload));
      }
      onSaved(data.assessment);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save assessment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isFinalExam ? '🏁 Final Course Examination Setup' : `📝 ${sectionTitle || 'Section'} Test Setup`}
      description={isFinalExam ? 'Mandatory final examination required before this course can be published.' : 'Optional knowledge check assessing student comprehension for this section.'}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-app pb-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`font-semibold px-2.5 py-1 rounded-full ${
                step === 1 ? 'bg-blue-600 text-white' : 'text-app-muted hover:text-app'
              }`}
            >
              1. Upload Document
            </button>
            <span className="text-app-muted">→</span>
            <button
              type="button"
              onClick={() => questions.length > 0 && setStep(2)}
              disabled={questions.length === 0}
              className={`font-semibold px-2.5 py-1 rounded-full ${
                step === 2 ? 'bg-blue-600 text-white' : 'text-app-muted hover:text-app disabled:opacity-40'
              }`}
            >
              2. Review Questions ({questions.length})
            </button>
            <span className="text-app-muted">→</span>
            <button
              type="button"
              onClick={() => questions.length > 0 && setStep(3)}
              disabled={questions.length === 0}
              className={`font-semibold px-2.5 py-1 rounded-full ${
                step === 3 ? 'bg-blue-600 text-white' : 'text-app-muted hover:text-app disabled:opacity-40'
              }`}
            >
              3. Test Rules
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-btn text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── STEP 1: UPLOAD QUESTION BANK & SECURITY SCAN ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-app block">Assessment Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. System Architecture Final Exam"
                className="w-full h-9 px-3 text-xs rounded-btn bg-elevated border border-app text-app focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-app block">
                Upload Question Bank Document (PDF or Word DOCX)
              </label>
              
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`border-2 border-dashed border-slate-300 dark:border-dark-border rounded-card p-6 text-center transition-all bg-surface dark:bg-dark-surface ${
                  uploading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:border-blue-500'
                }`}
              >
                <div className="flex justify-center mb-2">
                  <div className="p-3 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <UploadCloud className="h-7 w-7" />
                  </div>
                </div>

                <p className="text-xs font-bold text-app">
                  {uploading ? 'Scanning for security threats & extracting questions...' : 'Click or Drag & Drop PDF or Word document (.docx, .pdf)'}
                </p>
                <p className="text-[11px] text-app-muted mt-1 max-w-md mx-auto leading-relaxed">
                  Extracts questions, choices (A, B, C, D), and answers from AI-generated files, typed documents, or web test papers.
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1 font-medium">
                    <ShieldCheck className="h-3 w-3 text-emerald-500" /> Magic Byte Signature Check
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    <ShieldCheck className="h-3 w-3 text-emerald-500" /> VBA Macro & Exploit Filter
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    <ShieldCheck className="h-3 w-3 text-emerald-500" /> Anti-Cheat Answer Stripping
                  </span>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {uploadedFileName && (
              <div className="p-3 rounded-btn bg-blue-50/70 dark:bg-slate-800/80 border border-blue-200 dark:border-blue-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold text-app">{uploadedFileName}</span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                    • {questions.length} Questions Extracted
                  </span>
                </div>
                <Button size="xs" onClick={() => setStep(2)}>Review Questions →</Button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: INTERACTIVE QUESTIONS REVIEW ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-app">
                Extracted Questions ({questions.length} total)
              </span>
              <span className="text-[11px] text-app-muted">
                Click a radio button to change the correct answer key.
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {questions.map((q, qIdx) => (
                <div
                  key={q.id || qIdx}
                  className="p-3.5 rounded-btn bg-elevated border border-app space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1">
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                        {qIdx + 1}.
                      </span>
                      <input
                        type="text"
                        value={q.questionText || q.text || ''}
                        onChange={(e) => handleUpdateQuestionText(qIdx, e.target.value)}
                        className="w-full text-xs font-semibold text-app bg-transparent border-b border-transparent hover:border-app focus:border-blue-500 focus:outline-none transition-colors"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(qIdx)}
                      title="Remove question"
                      className="text-app-muted hover:text-red-500 p-1 rounded transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Options List with Selection Radio */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {(q.options || []).map((opt, oIdx) => {
                      const isCorrect = (q.correctOption !== undefined ? q.correctOption : q.correctAnswer) === oIdx;
                      const letter = String.fromCharCode(65 + oIdx);
                      return (
                        <div
                          key={oIdx}
                          onClick={() => handleSetCorrectOption(qIdx, oIdx)}
                          className={`p-2 rounded border flex items-center gap-2 cursor-pointer transition-colors ${
                            isCorrect
                              ? 'bg-emerald-500/10 border-emerald-500/60 text-emerald-700 dark:text-emerald-300 font-semibold'
                              : 'bg-surface dark:bg-dark-surface border-app text-app-secondary hover:border-blue-500/40'
                          }`}
                        >
                          <span
                            className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              isCorrect
                                ? 'bg-emerald-600 text-white'
                                : 'border border-app text-app-muted'
                            }`}
                          >
                            {letter}
                          </span>
                          <span className="truncate text-xs">{opt}</span>
                          {isCorrect && (
                            <span className="ml-auto text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              ✓ Correct
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-app">
              <Button size="sm" variant="outline" onClick={() => setStep(1)}>
                ← Back to Upload
              </Button>
              <Button size="sm" onClick={() => setStep(3)}>
                Configure Rules ({questions.length} Questions) →
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: CONFIGURE TEST RULES ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="p-4 rounded-card bg-surface dark:bg-dark-surface border border-app space-y-4">
              <h4 className="text-xs font-bold text-app uppercase tracking-wider">
                Exam Delivery & Passing Rules (Creator & Admin Only)
              </h4>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-app flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5 text-blue-500" />
                    Passing Threshold (%)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={passingScore}
                      onChange={(e) => setPassingScore(Number(e.target.value))}
                      className="w-full h-9 pl-3 pr-8 text-xs rounded-btn bg-elevated border border-app text-app font-mono font-bold focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="absolute right-1 inset-y-1 flex flex-col justify-center border-l border-app/60 pl-1">
                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={() => setPassingScore((prev) => Math.min(100, Number(prev || 0) + 1))}
                        className="text-app-muted hover:text-blue-500 p-0.5 transition-colors leading-none"
                        title="Increase"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={() => setPassingScore((prev) => Math.max(10, Number(prev || 0) - 1))}
                        className="text-app-muted hover:text-blue-500 p-0.5 transition-colors leading-none"
                        title="Decrease"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-app-muted">Min score required to pass</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-app flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-purple-500" />
                    Questions per Attempt
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      min="1"
                      max={questions.length || 10}
                      value={sampleSize}
                      onChange={(e) => setSampleSize(Number(e.target.value))}
                      className="w-full h-9 pl-3 pr-8 text-xs rounded-btn bg-elevated border border-app text-app font-mono font-bold focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="absolute right-1 inset-y-1 flex flex-col justify-center border-l border-app/60 pl-1">
                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={() => setSampleSize((prev) => Math.min(questions.length || 10, Number(prev || 0) + 1))}
                        className="text-app-muted hover:text-blue-500 p-0.5 transition-colors leading-none"
                        title="Increase"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={() => setSampleSize((prev) => Math.max(1, Number(prev || 0) - 1))}
                        className="text-app-muted hover:text-blue-500 p-0.5 transition-colors leading-none"
                        title="Decrease"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-app-muted">Randomly drawn from pool of {questions.length}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-app flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    Time Limit (Minutes)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      min="5"
                      max="180"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      className="w-full h-9 pl-3 pr-8 text-xs rounded-btn bg-elevated border border-app text-app font-mono font-bold focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="absolute right-1 inset-y-1 flex flex-col justify-center border-l border-app/60 pl-1">
                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={() => setDurationMinutes((prev) => Math.min(180, Number(prev || 0) + 5))}
                        className="text-app-muted hover:text-blue-500 p-0.5 transition-colors leading-none"
                        title="Increase"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={() => setDurationMinutes((prev) => Math.max(5, Number(prev || 0) - 5))}
                        className="text-app-muted hover:text-blue-500 p-0.5 transition-colors leading-none"
                        title="Decrease"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-app-muted">Auto-submits when time expires</p>
                </div>
              </div>
            </div>

            {/* Anti-Cheating & Privacy Guarantee Callout */}
            <div className="p-3.5 rounded-btn bg-blue-50/60 dark:bg-slate-800/80 border border-blue-200 dark:border-blue-900 flex items-start gap-2.5 text-xs text-app-secondary">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-app">Secure Exam Protection Active</p>
                <p className="text-[11px] leading-relaxed">
                  Question papers and correct answers are completely hidden from students. Tests are scored automatically and securely by the system.
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-app">
              <Button size="sm" variant="outline" onClick={() => setStep(2)}>
                ← Back to Questions
              </Button>
              <Button size="sm" isLoading={saving} onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                Save & Publish Assessment
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
