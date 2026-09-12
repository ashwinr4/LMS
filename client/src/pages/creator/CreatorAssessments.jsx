import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { CustomDropdown } from '../../components/ui/CustomDropdown.jsx';
import {
  FileCheck2,
  Plus,
  Trash2,
  Edit,
  Clock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

export default function CreatorAssessments() {
  const [assessments, setAssessments] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Editor Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState(null);
  const [formData, setFormData] = useState({
    moduleId: '',
    title: '',
    description: '',
    passingScore: 75,
    sampleSize: 5,
    durationMinutes: 30,
    randomizeQuestions: true,
    questions: [],
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [assRes, modRes] = await Promise.all([
        api.get('/assessments'),
        api.get('/modules'),
      ]);

      if (assRes.data.success) setAssessments(assRes.data.assessments || []);
      if (modRes.data.success) setModules(modRes.data.modules || []);
    } catch (err) {
      console.error('Failed to fetch assessment data:', err);
      setError(err.response?.data?.message || 'Failed to load assessments.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingAssessment(null);
    setFormData({
      moduleId: modules[0]?.id || '',
      title: '',
      description: '',
      passingScore: 75,
      sampleSize: 5,
      durationMinutes: 30,
      randomizeQuestions: true,
      questions: [
        {
          id: 'q1',
          text: 'What is the primary benefit of zero-trust architecture in enterprise software?',
          type: 'MCQ',
          options: [
            'Continuous mutual verification and least-privilege access',
            'Faster unauthenticated API responses',
            'Removing all network encryption',
            'Single static master password for all services',
          ],
          correctAnswer: 0,
          explanation: 'Zero-trust requires strict identity verification and least privilege at all times.',
          points: 10,
        },
      ],
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = async (assessmentId) => {
    try {
      const res = await api.get(`/assessments/${assessmentId}`);
      if (res.data.success) {
        const a = res.data.assessment;
        setEditingAssessment(a);
        setFormData({
          moduleId: a.moduleId,
          title: a.title,
          description: a.description || '',
          passingScore: a.passingScore,
          sampleSize: a.sampleSize,
          durationMinutes: a.durationMinutes,
          randomizeQuestions: a.randomizeQuestions,
          questions: a.questions || [],
        });
        setIsModalOpen(true);
      }
    } catch (err) {
      alert('Failed to load assessment details.');
    }
  };

  const handleAddQuestion = () => {
    const newQ = {
      id: `q_${Date.now()}`,
      text: '',
      type: 'MCQ',
      options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
      correctAnswer: 0,
      explanation: '',
      points: 10,
    };
    setFormData((prev) => ({ ...prev, questions: [...prev.questions, newQ] }));
  };

  const handleRemoveQuestion = (idx) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
  };

  const handleUpdateQuestion = (idx, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.questions];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, questions: updated };
    });
  };

  const handleUpdateOption = (qIdx, optIdx, value) => {
    setFormData((prev) => {
      const updated = [...prev.questions];
      const opts = [...updated[qIdx].options];
      opts[optIdx] = value;
      updated[qIdx].options = opts;
      return { ...prev, questions: updated };
    });
  };

  const handleSaveAssessment = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.moduleId) {
      alert('Please fill out the course module and assessment title.');
      return;
    }
    if (formData.questions.length === 0) {
      alert('Please add at least one question to the assessment.');
      return;
    }

    try {
      if (editingAssessment) {
        await api.put(`/assessments/${editingAssessment.id}`, formData);
      } else {
        await api.post('/assessments', formData);
      }
      setIsModalOpen(false);
      fetchInitialData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error saving assessment.');
    }
  };

  const handleDeleteAssessment = async (id) => {
    if (!confirm('Are you sure you want to delete this question bank?')) return;
    try {
      await api.delete(`/assessments/${id}`);
      fetchInitialData();
    } catch (err) {
      alert('Failed to delete assessment.');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Question Banks & Exam Authoring"
        description="Design proctored assessments, configure randomized question pools, pass thresholds, and automated certification criteria."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreateModal}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Create Question Bank
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-card border border-app rounded-card p-6 animate-pulse space-y-4">
              <div className="h-4 bg-surface-tertiary rounded w-1/4" />
              <div className="h-6 bg-surface-tertiary rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-card text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : assessments.length === 0 ? (
        <div className="p-12 bg-card border border-app rounded-card text-center space-y-4">
          <FileCheck2 className="h-12 w-12 text-app-muted mx-auto" />
          <h3 className="text-base font-bold text-app">No Question Banks Created</h3>
          <p className="text-sm text-app-secondary max-w-md mx-auto">
            Create an assessment to allow enrolled students to take proctored certification examinations.
          </p>
          <Button variant="primary" onClick={handleOpenCreateModal} leftIcon={<Plus className="h-4 w-4" />}>
            Create First Question Bank
          </Button>
        </div>
      ) : (
        <div className="grid gap-6">
          {assessments.map((a) => (
            <div
              key={a.id}
              className="bg-card border border-app rounded-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm hover:shadow-md transition-all"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
                    {a.moduleCode}
                  </span>
                  <span className="meta-divider" />
                  <span className="text-xs text-app-secondary">{a.moduleTitle}</span>
                  <span className="meta-divider" />
                  <StatusBadge status="ACTIVE" label={`${a.questionCount} Questions`} size="xs" />
                </div>

                <h3 className="text-base font-bold text-app">{a.title}</h3>
                {a.description && <p className="text-xs text-app-secondary max-w-2xl">{a.description}</p>}

                <div className="flex flex-wrap items-center gap-4 text-xs text-app-secondary font-medium pt-1">
                  <span>⏱️ {a.durationMinutes} Mins</span>
                  <span>🎯 Pass: {a.passingScore}%</span>
                  <span>🎲 Draw: {a.sampleSize} questions / exam</span>
                  <span>📝 {a.submissionCount} Submissions</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Edit className="h-4 w-4" />}
                  onClick={() => handleOpenEditModal(a.id)}
                >
                  Edit Bank
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Trash2 className="h-4 w-4 text-red-500" />}
                  onClick={() => handleDeleteAssessment(a.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAssessment ? 'Edit Question Bank' : 'Create New Assessment'}
        className="max-w-3xl"
      >
        <form onSubmit={handleSaveAssessment} className="space-y-6 text-sm">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-app-secondary uppercase">Associated Course Module</label>
              <CustomDropdown
                value={formData.moduleId}
                onChange={(val) => setFormData({ ...formData, moduleId: val })}
                options={modules.map((m) => ({ value: m.id, label: `${m.code} - ${m.title}` }))}
                className="w-full"
                placeholder="Select Course Module"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-app-secondary uppercase">Assessment Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Official Certification Exam: Cloud Architecture"
                className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2.5 text-xs text-app"
                required
              />
            </div>
          </div>

          {/* Exam Parameters */}
          <div className="grid grid-cols-3 gap-4 p-4 rounded-card bg-surface-tertiary/60 dark:bg-dark-elevated/40 border border-app">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-app-secondary">Duration (Mins)</label>
              <input
                type="number"
                min="5"
                max="180"
                value={formData.durationMinutes}
                onChange={(e) => setFormData({ ...formData, durationMinutes: Number(e.target.value) })}
                className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-app-secondary">Passing Score (%)</label>
              <input
                type="number"
                min="50"
                max="100"
                value={formData.passingScore}
                onChange={(e) => setFormData({ ...formData, passingScore: Number(e.target.value) })}
                className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-app-secondary">Sample Size / Exam</label>
              <input
                type="number"
                min="1"
                max="50"
                value={formData.sampleSize}
                onChange={(e) => setFormData({ ...formData, sampleSize: Number(e.target.value) })}
                className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app"
              />
            </div>
          </div>

          {/* Questions Builder */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs uppercase tracking-wider text-app-secondary">
                Question Bank ({formData.questions.length} Questions)
              </h4>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleAddQuestion}
                leftIcon={<Plus className="h-3.5 w-3.5" />}
              >
                Add Question
              </Button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {formData.questions.map((q, qIdx) => (
                <div key={q.id || qIdx} className="p-4 rounded-card border border-app bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-brand-600 dark:text-brand-400">
                      Question #{qIdx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(qIdx)}
                      className="text-red-500 hover:text-red-600 text-xs font-semibold"
                    >
                      Remove
                    </button>
                  </div>

                  <input
                    type="text"
                    value={q.text}
                    onChange={(e) => handleUpdateQuestion(qIdx, 'text', e.target.value)}
                    placeholder="Enter question text / prompt..."
                    className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app"
                    required
                  />

                  {/* Options */}
                  <div className="space-y-2 pt-1">
                    <label className="text-[11px] font-semibold text-app-secondary">
                      Options & Correct Answer Radio:
                    </label>
                    {(q.options || []).map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct_${qIdx}`}
                          checked={Number(q.correctAnswer) === optIdx}
                          onChange={() => handleUpdateQuestion(qIdx, 'correctAnswer', optIdx)}
                          className="h-4 w-4 text-brand-600"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => handleUpdateOption(qIdx, optIdx, e.target.value)}
                          className="flex-1 bg-surface dark:bg-dark-surface border border-app rounded-btn p-1.5 text-xs text-app"
                          placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                          required
                        />
                      </div>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={q.explanation || ''}
                    onChange={(e) => handleUpdateQuestion(qIdx, 'explanation', e.target.value)}
                    placeholder="Rationale / Explanation for student review (optional)"
                    className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app-secondary"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-app">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingAssessment ? 'Update Question Bank' : 'Save Question Bank'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
