import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Select } from '../../components/ui/Select.jsx';
import {
  BookOpen, Plus, Edit2, Trash2, ChevronRight,
  Video, FileText, Youtube, File, Search, Layers,
  Clock, Star, Users, RefreshCw, AlertCircle, Image as ImageIcon,
  CheckCircle2, UploadCloud, Link as LinkIcon, Calendar,
  Rocket, Check, Globe, GraduationCap, Award, HelpCircle,
  Loader2,
} from 'lucide-react';
import { AssessmentSetupModal } from '../../components/creator/AssessmentSetupModal.jsx';

// ─── Duration from Calendar Date Helper ──────────────────────
function computeDurationFromDate(targetDateStr) {
  if (!targetDateStr) return '';
  const target = new Date(targetDateStr);
  const now = new Date();
  const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return 'Immediate Completion';
  
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  const formattedDate = target.toLocaleDateString('en-US', options);

  if (diffDays < 7) {
    return `${diffDays} Day${diffDays !== 1 ? 's' : ''} (Ends ${formattedDate})`;
  } else if (diffDays < 30) {
    const weeks = Math.ceil(diffDays / 7);
    return `${weeks} Week${weeks !== 1 ? 's' : ''} (Ends ${formattedDate})`;
  } else {
    const months = Math.round(diffDays / 30);
    return `${months} Month${months !== 1 ? 's' : ''} (Ends ${formattedDate})`;
  }
}

function getTodayDateString() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// ─── Lesson Type Icon ───────────────────────────────────────
function LessonTypeIcon({ type }) {
  const map = {
    VIDEO: <Video className="h-3.5 w-3.5 text-blue-500" />,
    YOUTUBE: <Youtube className="h-3.5 w-3.5 text-red-500" />,
    MARKDOWN: <FileText className="h-3.5 w-3.5 text-purple-500" />,
    DOCUMENT: <File className="h-3.5 w-3.5 text-amber-500" />,
    PDF: <File className="h-3.5 w-3.5 text-rose-500" />,
    IMAGE: <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />,
  };
  return map[type] || <FileText className="h-3.5 w-3.5 text-gray-400" />;
}

// ─── Create Course Modal with Calendar Date Picker ──────────
function NewCourseModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({
    code: '', title: '', department: 'Engineering', level: 'Intermediate',
    targetDate: '', duration: '', description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDateChange = (e) => {
    const dateVal = e.target.value;
    const computed = computeDurationFromDate(dateVal);
    setForm((prev) => ({ ...prev, targetDate: dateVal, duration: computed }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/modules', {
        ...form,
        duration: form.duration || '4 Weeks',
        expiresAt: form.targetDate ? new Date(form.targetDate) : undefined,
      });
      onCreated(data.module);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create course.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Course" maxWidth="max-w-lg">
      <form onSubmit={handleCreate} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-btn text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Course Code" placeholder="e.g. CORS-101" value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
          <Select label="Department" value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            options={['Engineering', 'Security', 'Data Science', 'Operations', 'Product', 'Administration']} />
        </div>

        <Input label="Course Title" placeholder="e.g. Cloud Security Architecture" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} required />

        <div className="grid grid-cols-2 gap-3">
          <Select label="Difficulty Level" value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
            options={['Beginner', 'Intermediate', 'Advanced']} />
          
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-app select-none">
              Target Completion Date
            </label>
            <input
              type="date"
              min={getTodayDateString()}
              value={form.targetDate}
              onChange={handleDateChange}
              className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm h-10 px-3.5 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              required
            />
          </div>
        </div>

        {form.duration && (
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-btn text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span><strong>Calculated Duration:</strong> {form.duration}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text-secondary">
            Course Description
          </label>
          <textarea value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3} placeholder="Provide a comprehensive overview of this course for students..."
            className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm p-3 resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-app-muted shadow-xs" />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" isLoading={loading} className="flex-1">Create Course</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit Course Details Modal with Calendar Date Picker ─────
function EditCourseModal({ isOpen, onClose, course, onUpdated, onRequestDelete }) {
  const [form, setForm] = useState({
    code: '', title: '', department: 'Engineering', level: 'Intermediate',
    status: 'DRAFT', targetDate: '', duration: '', description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (course) {
      setForm({
        code: course.code || '',
        title: course.title || '',
        department: course.department || 'Engineering',
        level: course.level || 'Intermediate',
        status: course.status || 'DRAFT',
        targetDate: course.expiresAt ? new Date(course.expiresAt).toISOString().split('T')[0] : '',
        duration: course.duration || '',
        description: course.description || '',
      });
    }
  }, [course, isOpen]);

  const handleDateChange = (e) => {
    const dateVal = e.target.value;
    const computed = computeDurationFromDate(dateVal);
    setForm((prev) => ({ ...prev, targetDate: dateVal, duration: computed }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.put(`/modules/${course.id}`, {
        code: form.code.toUpperCase().trim(),
        title: form.title,
        department: form.department,
        level: form.level,
        status: form.status,
        duration: form.duration || course.duration,
        description: form.description,
        expiresAt: form.targetDate ? new Date(form.targetDate) : undefined,
      });
      onUpdated(data.module);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update course details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Course Details" maxWidth="max-w-lg">
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-btn text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Course Code"
            placeholder="e.g. CORS-101"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            required
          />
          <Select
            label="Course Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[
              { value: 'DRAFT', label: 'Draft (Hidden from Catalog)' },
              { value: 'ACTIVE', label: 'Active (Published to Catalog)' },
            ]}
          />
        </div>

        <Input
          label="Course Title"
          placeholder="e.g. Cloud Security Architecture"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            options={['Engineering', 'Security', 'Data Science', 'Operations', 'Product', 'Administration']}
          />
          <Select
            label="Difficulty Level"
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
            options={['Beginner', 'Intermediate', 'Advanced']}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-app select-none">
            Target Completion / Expiry Date
          </label>
          <input
            type="date"
            min={getTodayDateString()}
            value={form.targetDate}
            onChange={handleDateChange}
            className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm h-10 px-3.5 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {form.duration && (
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-btn text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span><strong>Course Duration:</strong> {form.duration}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text-secondary">
            Course Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="Course overview and objectives..."
            className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm p-3 resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-app-muted shadow-xs"
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-app">
          <button
            type="button"
            onClick={() => {
              onClose();
              onRequestDelete();
            }}
            className="text-xs text-red-600 dark:text-red-400 font-semibold hover:underline flex items-center gap-1.5 group"
          >
            <Trash2 className="h-3.5 w-3.5 animate-icon-trash" />
            <span>Delete Course</span>
          </button>

          <div className="flex items-center gap-2.5">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={loading}>
              Save Changes
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── Add Section Modal ───────────────────────────────────────
function AddSectionModal({ isOpen, onClose, moduleId, onCreated }) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post(`/modules/${moduleId}/sections`, { title });
      onCreated(data.section);
      setTitle('');
      onClose();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Section" maxWidth="max-w-sm">
      <form onSubmit={handleCreate} className="space-y-4">
        <Input label="Section Title" placeholder="e.g. Section 1: Core Fundamentals"
          value={title} onChange={(e) => setTitle(e.target.value)} required />
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" isLoading={loading} className="flex-1">Add Section</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Multi-Modal Lecture Creation / Edit Modal ───────────────
function LessonModal({ isOpen, onClose, sectionId, lesson, onSaved }) {
  const isEdit = !!lesson;
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    title: lesson?.title || '',
    type: lesson?.type || 'VIDEO',
    videoUrl: lesson?.videoUrl || '',
    duration: lesson?.duration || '',
    content: lesson?.content || '',
    documentName: lesson?.documentName || '',
    notes: lesson?.notes || '',
  });

  const [detectedDuration, setDetectedDuration] = useState(lesson?.duration || null);
  const [previewImage, setPreviewImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (lesson) {
      setForm({
        title: lesson.title || '',
        type: lesson.type || 'VIDEO',
        videoUrl: lesson.videoUrl || '',
        duration: lesson.duration || '',
        content: lesson.content || '',
        documentName: lesson.documentName || '',
        notes: lesson.notes || '',
      });
      setDetectedDuration(lesson.duration || null);
      if (lesson.type === 'IMAGE' && lesson.videoUrl) {
        setPreviewImage(lesson.videoUrl);
      }
    } else {
      setForm({
        title: '',
        type: 'VIDEO',
        videoUrl: '',
        duration: '',
        content: '',
        documentName: '',
        notes: '',
      });
      setDetectedDuration(null);
      setPreviewImage(null);
    }
    setUploading(false);
    setUploadProgress(0);
  }, [lesson, isOpen]);

  // Automatic Video Duration Detection from HTML5 metadata
  const handleDetectVideoDuration = (source) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        if (typeof source !== 'string') {
          window.URL.revokeObjectURL(video.src);
        }
        const totalSecs = Math.round(video.duration);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        const durFormatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        const humanReadable = `${mins} min${mins !== 1 ? 's' : ''} ${secs} sec${secs !== 1 ? 's' : ''}`;
        setForm((prev) => ({ ...prev, duration: durFormatted }));
        setDetectedDuration(humanReadable);
      };
      video.onerror = () => {
        setDetectedDuration(null);
      };
      video.src = typeof source === 'string' ? source : URL.createObjectURL(source);
    } catch {
      setDetectedDuration(null);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (form.type === 'VIDEO') {
      handleDetectVideoDuration(file);
    } else if (form.type === 'IMAGE') {
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post('/modules/upload-media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(pct);
          }
        },
      });

      if (data?.fileUrl) {
        setForm((prev) => ({
          ...prev,
          videoUrl: data.fileUrl,
          documentName: file.name,
        }));
        if (form.type === 'IMAGE') {
          setPreviewImage(data.fileUrl);
        }
      }
    } catch (err) {
      console.error('Lecture media upload failed:', err);
      setError(err.response?.data?.message || 'Failed to upload lecture media to server.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let data;
      if (isEdit) {
        ({ data } = await api.put(`/modules/lessons/${lesson.id}`, form));
      } else {
        ({ data } = await api.post(`/modules/sections/${sectionId}/lessons`, form));
      }
      onSaved(data.lesson);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save lecture.');
    } finally {
      setLoading(false);
    }
  };

  const contentTypeOptions = [
    { value: 'VIDEO', label: '🎬 Video Lecture' },
    { value: 'DOCUMENT', label: '📄 PDF / Word Document' },
    { value: 'MARKDOWN', label: '📝 Article / Reading Notes' },
    { value: 'IMAGE', label: '🖼️ Image / Diagram' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={isEdit ? 'Edit Lecture' : 'Add New Lecture'} maxWidth="max-w-xl">
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-btn text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <Input
          label="Lecture Title"
          placeholder="e.g. 1.2 System Architecture Deep Dive"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />

        <Select
          label="Content Type"
          value={form.type}
          onChange={(e) => {
            setForm({ ...form, type: e.target.value });
            setDetectedDuration(null);
            setPreviewImage(null);
          }}
          options={contentTypeOptions}
        />

        {/* 🎬 1. VIDEO LECTURE */}
        {form.type === 'VIDEO' && (
          <div className="space-y-3 p-4 bg-slate-50 dark:bg-dark-elevated rounded-card border border-slate-200 dark:border-dark-border">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-app">
                Video Source (File Upload or Stream URL)
              </label>
              
              {uploading ? (
                <div className="border-2 border-dashed border-brand-400 dark:border-brand-500 rounded-btn p-5 text-center bg-brand-50/50 dark:bg-brand-950/20">
                  <Loader2 className="h-6 w-6 text-brand-600 dark:text-brand-400 animate-spin mx-auto mb-2" />
                  <p className="text-xs font-semibold text-app">Uploading video to server...</p>
                  <div className="w-56 max-w-full mx-auto bg-slate-200 dark:bg-dark-border h-2 rounded-full overflow-hidden mt-2.5">
                    <div className="bg-brand-600 h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span className="text-[11px] font-mono text-brand-600 dark:text-brand-400 font-bold mt-1 inline-block">{uploadProgress}%</span>
                </div>
              ) : form.documentName ? (
                <div className="border border-slate-200 dark:border-dark-border rounded-btn p-3 bg-white dark:bg-dark-surface flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-btn bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                      <Video className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-app truncate">{form.documentName}</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Uploaded & Ready</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, videoUrl: '', documentName: '', duration: '' }));
                      setDetectedDuration(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-btn border border-red-200 dark:border-red-900 transition-colors flex items-center gap-1 shrink-0"
                  >
                    <Trash2 className="h-3 w-3 animate-icon-trash" />
                    <span>Remove Video</span>
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-dark-border rounded-btn p-4 text-center cursor-pointer hover:border-brand-500 dark:hover:border-brand-400 transition-colors bg-white dark:bg-dark-surface"
                >
                  <UploadCloud className="h-8 w-8 text-brand-600 dark:text-brand-400 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-app">
                    Click or Drag & Drop MP4 / WebM video file
                  </p>
                  <p className="text-[11px] text-app-muted mt-0.5">MP4, WebM, MOV up to 1GB</p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            <div className="flex items-center my-3 text-center">
              <div className="flex-1 border-t border-slate-200 dark:border-dark-border" />
              <span className="px-3 text-[10px] font-bold text-app-muted uppercase tracking-wider">or video stream URL</span>
              <div className="flex-1 border-t border-slate-200 dark:border-dark-border" />
            </div>

            <Input
              label="Direct Video URL (MP4/CDN/YouTube)"
              placeholder="https://cdn.example.com/videos/lecture.mp4"
              value={form.videoUrl}
              onChange={(e) => {
                const url = e.target.value;
                setForm((prev) => ({ ...prev, videoUrl: url }));
                if (url.includes('.mp4') || url.includes('.webm')) {
                  handleDetectVideoDuration(url);
                }
              }}
              leftIcon={<LinkIcon className="h-3.5 w-3.5" />}
            />

            {detectedDuration && (
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-btn text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  <strong>Video Duration:</strong> {detectedDuration}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 📄 2. PDF / WORD DOCUMENT */}
        {(form.type === 'DOCUMENT' || form.type === 'PDF') && (
          <div className="space-y-3 p-4 bg-slate-50 dark:bg-dark-elevated rounded-card border border-slate-200 dark:border-dark-border">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-app">PDF / Word File Upload</label>
              {uploading ? (
                <div className="border-2 border-dashed border-brand-400 dark:border-brand-500 rounded-btn p-5 text-center bg-brand-50/50 dark:bg-brand-950/20">
                  <Loader2 className="h-6 w-6 text-brand-600 dark:text-brand-400 animate-spin mx-auto mb-2" />
                  <p className="text-xs font-semibold text-app">Uploading document to server...</p>
                  <div className="w-56 max-w-full mx-auto bg-slate-200 dark:bg-dark-border h-2 rounded-full overflow-hidden mt-2.5">
                    <div className="bg-brand-600 h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span className="text-[11px] font-mono text-brand-600 dark:text-brand-400 font-bold mt-1 inline-block">{uploadProgress}%</span>
                </div>
              ) : form.documentName ? (
                <div className="border border-slate-200 dark:border-dark-border rounded-btn p-3 bg-white dark:bg-dark-surface flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-btn bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-app truncate">{form.documentName}</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Uploaded & Ready</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, videoUrl: '', documentName: '' }));
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-btn border border-red-200 dark:border-red-900 transition-colors flex items-center gap-1 shrink-0"
                  >
                    <Trash2 className="h-3 w-3 animate-icon-trash" />
                    <span>Remove Document</span>
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-dark-border rounded-btn p-4 text-center cursor-pointer hover:border-brand-500 transition-colors bg-white dark:bg-dark-surface"
                >
                  <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-app">Click to select PDF or Word document</p>
                  <p className="text-[11px] text-app-muted mt-0.5">PDF, DOC, DOCX files up to 50MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            <Input
              label="Document Link / URL"
              placeholder="https://storage.qualiva.io/docs/manual.pdf"
              value={form.videoUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, videoUrl: e.target.value }))}
              leftIcon={<LinkIcon className="h-3.5 w-3.5" />}
            />
          </div>
        )}

        {/* 📝 3. WORD / READING DOCUMENT */}
        {form.type === 'MARKDOWN' && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-app">
              Reading Lecture Article & Formatted Notes
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={7}
              placeholder="# Lecture Topic&#10;&#10;Write comprehensive lecture notes, code blocks, or reading instructions for students here..."
              className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm p-3 resize-y font-mono focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-app-muted min-h-[140px]"
            />
          </div>
        )}

        {/* 🖼️ 4. IMAGE / DIAGRAM */}
        {form.type === 'IMAGE' && (
          <div className="space-y-3 p-4 bg-slate-50 dark:bg-dark-elevated rounded-card border border-slate-200 dark:border-dark-border">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-app">Image Diagram Upload</label>
              {previewImage ? (
                <div className="space-y-2">
                  <div className="rounded-btn border border-app overflow-hidden max-h-48 bg-slate-900 flex items-center justify-center p-2">
                    <img src={previewImage} alt="Diagram preview" className="max-h-44 object-contain rounded" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewImage(null);
                      setForm((prev) => ({ ...prev, videoUrl: '', documentName: '' }));
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-btn border border-red-200 dark:border-red-900 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3 animate-icon-trash" />
                    <span>Remove Image</span>
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-dark-border rounded-btn p-4 text-center cursor-pointer hover:border-brand-500 transition-colors bg-white dark:bg-dark-surface"
                >
                  <ImageIcon className="h-8 w-8 text-emerald-500 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-app">Click to select Diagram or Infographic</p>
                  <p className="text-[11px] text-app-muted mt-0.5">PNG, JPG, SVG, WebP up to 20MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text-secondary">
            Instructor Summary & Notes (optional)
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Key takeaways or summary shown beneath the player..."
            className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm p-3 resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-app-muted shadow-xs"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" isLoading={loading} className="flex-1">
            {isEdit ? 'Update Lecture' : 'Save Lecture'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main Course Studio View ────────────────────────────────
export default function CourseStudio() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseDetails, setCourseDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [search, setSearch] = useState('');

  // Modal states
  const [showNewCourse, setShowNewCourse] = useState(false);
  const [showEditCourse, setShowEditCourse] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  const [lessonModal, setLessonModal] = useState({ open: false, sectionId: null, lesson: null });
  const [assessmentModal, setAssessmentModal] = useState({
    open: false,
    sectionId: null,
    sectionTitle: '',
    isFinalExam: false,
    existingAssessment: null,
  });
  const [expandedSections, setExpandedSections] = useState({});

  // In-platform ConfirmDialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    variant: 'danger',
    onConfirm: () => {},
  });

  // Fetch creator's courses
  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/modules?status=ACTIVE');
      const all = await api.get('/modules?status=DRAFT');
      const combined = [...data.modules, ...all.data.modules].filter(
        (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i
      );
      setCourses(combined);
      if (combined.length > 0 && !selectedCourse) {
        setSelectedCourse(combined[0]);
      }
    } catch {
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch full curriculum for selected course
  const fetchCourseDetails = useCallback(async (courseId) => {
    setLoadingDetails(true);
    try {
      const { data } = await api.get(`/modules/${courseId}`);
      setCourseDetails(data.module);
    } catch {
      setCourseDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);
  useEffect(() => {
    if (selectedCourse) fetchCourseDetails(selectedCourse.id);
  }, [selectedCourse, fetchCourseDetails]);

  const toggleSection = (id) => setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));

  // Find final exam in courseDetails assessments
  const finalExam = (courseDetails?.assessments || []).find(
    (a) => a.description === 'FINAL_EXAM' || a.title?.toLowerCase().includes('final')
  );

  // 1-Click Publish / Unpublish Course
  const handlePublishCourse = async () => {
    if (!courseDetails) return;

    // Check final exam requirement before publish
    if (!finalExam) {
      setConfirmDialog({
        isOpen: true,
        title: 'Final Examination Required',
        message: 'A Final Course Examination must be configured before this course can be published to the public catalog. Click "Configure Final Exam" below.',
        confirmText: 'Configure Final Exam',
        variant: 'warning',
        onConfirm: () => {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          setAssessmentModal({
            open: true,
            sectionId: null,
            sectionTitle: '',
            isFinalExam: true,
            existingAssessment: null,
          });
        },
      });
      return;
    }

    setPublishing(true);
    try {
      const { data } = await api.put(`/modules/${courseDetails.id}`, { status: 'ACTIVE' });
      setSelectedCourse(data.module);
      setCourses((prev) => prev.map((c) => (c.id === data.module.id ? { ...c, status: 'ACTIVE' } : c)));
      fetchCourseDetails(data.module.id);
    } catch (err) {
      alert(err.response?.data?.message || 'Could not publish course.');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublishCourse = async () => {
    if (!courseDetails) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Unpublish Course to Draft?',
      message: 'Unpublishing will hide this course from the public Course Catalog. Enrolled students will still retain access.',
      confirmText: 'Unpublish Course',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        setPublishing(true);
        try {
          const { data } = await api.put(`/modules/${courseDetails.id}`, { status: 'DRAFT' });
          setSelectedCourse(data.module);
          setCourses((prev) => prev.map((c) => (c.id === data.module.id ? { ...c, status: 'DRAFT' } : c)));
          fetchCourseDetails(data.module.id);
        } finally {
          setPublishing(false);
        }
      },
    });
  };

  // In-platform confirmation for deleting a lecture
  const handleDeleteLesson = (lessonId) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Lecture?',
      message: 'Are you sure you want to permanently delete this lecture? This action cannot be undone.',
      confirmText: 'Delete Lecture',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        await api.delete(`/modules/lessons/${lessonId}`);
        fetchCourseDetails(selectedCourse.id);
      },
    });
  };

  // In-platform confirmation for deleting a section
  const handleDeleteSection = (sectionId) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Section and Lectures?',
      message: 'Are you sure you want to delete this section and all of its lectures? This action cannot be undone.',
      confirmText: 'Delete Section',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        await api.delete(`/modules/${selectedCourse.id}/sections/${sectionId}`);
        fetchCourseDetails(selectedCourse.id);
      },
    });
  };

  // In-platform confirmation for deleting a course
  const handleDeleteCourse = (courseId, courseTitle) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Entire Course?',
      message: `Are you sure you want to permanently delete "${courseTitle}" and all its curriculum data?`,
      confirmText: 'Delete Course',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        await api.delete(`/modules/${courseId}`);
        setCourses((prev) => prev.filter((c) => c.id !== courseId));
        setSelectedCourse(null);
        setCourseDetails(null);
      },
    });
  };

  const filteredCourses = courses.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Course Authoring Studio"
        description="Build curriculum architecture, manage multi-modal video/PDF/reading content, and publish enterprise courses."
        actions={
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4 animate-icon-plus" />}
            onClick={() => setShowNewCourse(true)}
          >
            New Course
          </Button>
        }
      />

      <div className="grid lg:grid-cols-[290px_1fr] gap-6 min-h-[70vh]">
        {/* ── Left Sidebar: Course List ── */}
        <div className="bg-card border border-app rounded-card p-4 space-y-3 self-start lg:sticky lg:top-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-app uppercase tracking-wider">Your Courses</span>
            <span className="text-[11px] font-mono text-app-muted">{courses.length} total</span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-app-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search courses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-8 pr-3 text-xs rounded-btn bg-elevated border border-app text-app focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 text-brand-500 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
              {filteredCourses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCourse(c)}
                  className={`w-full text-left p-3 rounded-btn text-xs transition-all border ${
                    selectedCourse?.id === c.id
                      ? 'border-l-4 border-l-blue-600 dark:border-l-blue-500 bg-blue-50/80 dark:bg-slate-800/90 border-blue-200 dark:border-blue-500/40 shadow-xs font-semibold'
                      : 'border-slate-200 dark:border-dark-border hover:bg-elevated text-app'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono font-bold text-[11px] text-blue-600 dark:text-blue-400">{c.code}</span>
                    <StatusBadge status={c.status} size="xs" />
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">{c.title}</p>
                  <p className="text-slate-600 dark:text-slate-300 mt-1 font-normal flex items-center">
                    <span>{c.department}</span>
                    <span className="meta-divider" />
                    <span>{c.level}</span>
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Unified Single Course Workspace Card ── */}
        <div>
          {!courseDetails && !loadingDetails && (
            <div className="bg-card border border-dashed border-app rounded-card p-12 text-center shadow-sm">
              <Layers className="h-10 w-10 text-app-muted mx-auto mb-3" />
              <p className="text-sm font-semibold text-app-secondary">Select a course to edit its curriculum</p>
            </div>
          )}

          {loadingDetails && (
            <div className="bg-card border border-app rounded-card p-12 text-center shadow-sm">
              <RefreshCw className="h-8 w-8 text-brand-500 animate-spin mx-auto" />
            </div>
          )}

          {courseDetails && !loadingDetails && (
            <div className="bg-card border border-app rounded-card shadow-sm overflow-hidden">
              {/* Top Course Information Header */}
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white bg-blue-600 px-2.5 py-0.5 rounded shadow-xs">
                        {courseDetails.code}
                      </span>
                      <span className="meta-divider" />
                      <StatusBadge status={courseDetails.status} size="xs" />
                      {courseDetails.level && (
                        <>
                          <span className="meta-divider" />
                          <span className="text-xs text-app-muted font-medium">{courseDetails.level}</span>
                        </>
                      )}
                      {courseDetails.department && (
                        <>
                          <span className="meta-divider" />
                          <span className="text-xs text-app-muted font-medium">{courseDetails.department}</span>
                        </>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-app tracking-tight">{courseDetails.title}</h2>
                    {courseDetails.description && (
                      <p className="text-xs text-app-secondary max-w-2xl leading-relaxed">{courseDetails.description}</p>
                    )}
                  </div>
                  
                  {/* Action Controls */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Edit2 className="h-3.5 w-3.5" />}
                      onClick={() => setShowEditCourse(true)}
                    >
                      Edit Details
                    </Button>
                    
                    {/* 1-Click Publish Action */}
                    {courseDetails.status === 'DRAFT' ? (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-xs"
                        leftIcon={<Rocket className="h-3.5 w-3.5 animate-icon-rocket" />}
                        onClick={handlePublishCourse}
                        isLoading={publishing}
                      >
                        Publish Course
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400 font-semibold"
                        leftIcon={<Check className="h-3.5 w-3.5 animate-icon-check" />}
                        onClick={handleUnpublishCourse}
                        isLoading={publishing}
                      >
                        Published ✓
                      </Button>
                    )}
                  </div>
                </div>

                {/* Metadata KPI Row */}
                <div className="flex flex-wrap items-center gap-5 text-xs text-app-muted border-t border-app pt-3.5">
                  <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-brand-500" />{courseDetails.duration || 'Flexible'}</span>
                  <span className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 text-blue-500" />{courseDetails.sections?.length || 0} Sections</span>
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-teal-500" />
                    {courseDetails.sections?.reduce((sum, s) => sum + (s.lessons?.length || 0), 0)} Lectures
                  </span>
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-purple-500" />{courseDetails.enrolledCount || 0} Students Enrolled</span>
                  <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-500" />{courseDetails.rating?.toFixed(1) || '5.0'} Rating</span>
                </div>
              </div>

              {/* Clean Section Divider */}
              <div className="border-t border-app bg-elevated/30 px-6 py-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-app uppercase tracking-wider">Curriculum Architecture</span>
                <span className="text-[11px] text-app-muted font-mono">{courseDetails.sections?.length || 0} Sections</span>
              </div>

              {/* Curriculum Sections & Lectures List Inside the Same Card */}
              <div className="p-6 space-y-4">
                {courseDetails.sections && courseDetails.sections.length > 0 ? (
                  courseDetails.sections.map((section, sIdx) => (
                    <div
                      key={section.id}
                      className="rounded-btn border border-slate-200 dark:border-dark-border bg-surface dark:bg-dark-surface overflow-hidden shadow-2xs"
                    >
                      {/* Section Accordion Header */}
                      <div
                        className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-elevated/60 transition-colors"
                        onClick={() => toggleSection(section.id)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold flex items-center justify-center shrink-0">
                            {sIdx + 1}
                          </span>
                          <div>
                            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{section.title}</h3>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{section.lessons?.length || 0} lectures</span>
                          </div>
                        </div>

                        {/* Right Section Action Buttons with clean spacing */}
                        <div className="flex items-center gap-2 sm:gap-3">
                          {/* Optional Section Test Action */}
                          {(() => {
                            const sectionTest = (courseDetails.assessments || []).find(
                              (a) => a.description === `SECTION_TEST:${section.id}`
                            );
                            return sectionTest ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssessmentModal({
                                    open: true,
                                    sectionId: section.id,
                                    sectionTitle: section.title,
                                    isFinalExam: false,
                                    existingAssessment: sectionTest,
                                  });
                                }}
                                className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 transition-colors flex items-center gap-1.5 shrink-0"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                <span>Test: {sectionTest.passingScore}% Pass</span>
                              </button>
                            ) : (
                              <Button
                                size="xs"
                                variant="outline"
                                className="px-2.5 py-1 text-xs font-semibold gap-1 shrink-0 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                                leftIcon={<HelpCircle className="h-3 w-3" />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssessmentModal({
                                    open: true,
                                    sectionId: section.id,
                                    sectionTitle: section.title,
                                    isFinalExam: false,
                                    existingAssessment: null,
                                  });
                                }}
                              >
                                + Section Test
                              </Button>
                            );
                          })()}

                          <Button
                            size="xs"
                            variant="outline"
                            className="px-3 py-1 text-xs font-semibold gap-1.5 shrink-0"
                            leftIcon={<Plus className="h-3 w-3 animate-icon-plus" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              setLessonModal({ open: true, sectionId: section.id, lesson: null });
                            }}
                          >
                            Add Lecture
                          </Button>
                          <button
                            type="button"
                            title="Delete Section"
                            onClick={(e) => { e.stopPropagation(); handleDeleteSection(section.id); }}
                            className="p-1.5 text-app-muted hover:text-red-500 transition-colors rounded group"
                          >
                            <Trash2 className="h-3.5 w-3.5 animate-icon-trash" />
                          </button>
                          <ChevronRight className={`h-4 w-4 text-app-muted transition-transform duration-200 ${expandedSections[section.id] !== false ? 'rotate-90' : ''}`} />
                        </div>
                      </div>

                      {/* Nested Lecture Items */}
                      {expandedSections[section.id] !== false && (
                        <div className="border-t border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border/60 bg-slate-50/40 dark:bg-dark-elevated/30">
                          {section.lessons?.map((lesson, lIdx) => (
                            <div
                              key={lesson.id}
                              className="flex items-center justify-between px-4 py-3 hover:bg-elevated transition-colors group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono w-7 shrink-0 font-medium">
                                  {sIdx + 1}.{lIdx + 1}
                                </span>
                                <LessonTypeIcon type={lesson.type} />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{lesson.title}</p>
                                  <div className="flex items-center gap-2 text-[10px] mt-0.5">
                                    <span className="uppercase font-mono font-bold text-blue-600 dark:text-blue-400">{lesson.type}</span>
                                    {lesson.duration && (
                                      <span className="text-slate-600 dark:text-slate-300 font-medium">• {lesson.duration}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                                <button
                                  type="button"
                                  title="Edit Lecture"
                                  onClick={() => setLessonModal({ open: true, sectionId: section.id, lesson })}
                                  className="p-1 text-app-muted hover:text-brand-600 rounded transition-colors"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete Lecture"
                                  onClick={() => handleDeleteLesson(lesson.id)}
                                  className="p-1 text-app-muted hover:text-red-500 rounded transition-colors group"
                                >
                                  <Trash2 className="h-3.5 w-3.5 animate-icon-trash" />
                                </button>
                              </div>
                            </div>
                          ))}

                          {(!section.lessons || section.lessons.length === 0) && (
                            <div className="p-4 text-center text-xs text-app-muted">
                              No lectures added yet. Click "Add Lecture" above.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center border border-dashed border-app rounded-btn space-y-2">
                    <p className="text-xs font-semibold text-app">No sections created yet.</p>
                    <p className="text-[11px] text-app-muted">Start structuring your course by adding the first section.</p>
                    <Button
                      size="sm"
                      leftIcon={<Plus className="h-3.5 w-3.5 animate-icon-plus" />}
                      onClick={() => setShowAddSection(true)}
                      className="mt-1"
                    >
                      Add Section
                    </Button>
                  </div>
                )}

                {/* Add Section Button */}
                {courseDetails.sections && courseDetails.sections.length > 0 && (
                  <div className="pt-2 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Plus className="h-3.5 w-3.5 animate-icon-plus" />}
                      onClick={() => setShowAddSection(true)}
                    >
                      Add Section
                    </Button>
                  </div>
                )}

                {/* 🏁 COMPULSORY FINAL COURSE EXAMINATION CARD */}
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-dark-border">
                  <div className="rounded-card border-2 border-dashed border-blue-500/40 bg-blue-50/20 dark:bg-slate-900/40 p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-card bg-blue-600 text-white shadow-xs shrink-0 mt-0.5">
                          <GraduationCap className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-app">
                              Final Course Examination
                            </h4>
                            {finalExam ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                                <Check className="h-3 w-3" /> Configured
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                Required to Publish
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-app-secondary">
                            Comprehensive assessment covering all curriculum sections before issuing certificates.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {finalExam ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-blue-500/40 text-blue-600 dark:text-blue-400 font-semibold"
                            leftIcon={<Edit2 className="h-3.5 w-3.5" />}
                            onClick={() => {
                              setAssessmentModal({
                                open: true,
                                sectionId: null,
                                sectionTitle: '',
                                isFinalExam: true,
                                existingAssessment: finalExam,
                              });
                            }}
                          >
                            Edit Final Exam
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
                            leftIcon={<UploadCloud className="h-3.5 w-3.5" />}
                            onClick={() => {
                              setAssessmentModal({
                                open: true,
                                sectionId: null,
                                sectionTitle: '',
                                isFinalExam: true,
                                existingAssessment: null,
                              });
                            }}
                          >
                            Upload Exam Questions
                          </Button>
                        )}
                      </div>
                    </div>

                    {finalExam && (
                      <div className="p-3 rounded-btn bg-surface dark:bg-dark-surface border border-app flex flex-wrap items-center gap-2 text-xs font-mono">
                        <span className="text-app-muted">
                          Passing Threshold: <strong className="text-blue-600 dark:text-blue-400">{finalExam.passingScore}%</strong>
                        </span>
                        <span className="meta-divider" />
                        <span className="text-app-muted">
                          Exam Questions: <strong className="text-app">{finalExam.sampleSize} Questions per Attempt</strong>
                        </span>
                        <span className="meta-divider" />
                        <span className="text-app-muted">
                          Time Limit: <strong className="text-app">{finalExam.durationMinutes || 30} Minutes</strong>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <NewCourseModal
        isOpen={showNewCourse}
        onClose={() => setShowNewCourse(false)}
        onCreated={(newCourse) => {
          setCourses((prev) => [newCourse, ...prev]);
          setSelectedCourse(newCourse);
        }}
      />

      {selectedCourse && (
        <EditCourseModal
          isOpen={showEditCourse}
          onClose={() => setShowEditCourse(false)}
          course={courseDetails || selectedCourse}
          onUpdated={(updated) => {
            setSelectedCourse(updated);
            setCourses((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
            fetchCourseDetails(updated.id);
          }}
          onRequestDelete={() => handleDeleteCourse(selectedCourse.id, selectedCourse.title)}
        />
      )}

      {selectedCourse && (
        <AddSectionModal
          isOpen={showAddSection}
          onClose={() => setShowAddSection(false)}
          moduleId={selectedCourse.id}
          onCreated={() => fetchCourseDetails(selectedCourse.id)}
        />
      )}

      <LessonModal
        isOpen={lessonModal.open}
        onClose={() => setLessonModal({ open: false, sectionId: null, lesson: null })}
        sectionId={lessonModal.sectionId}
        lesson={lessonModal.lesson}
        onSaved={() => fetchCourseDetails(selectedCourse.id)}
      />

      {/* In-Platform Themed Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
      />

      {/* Assessment Setup Modal (Section Tests & Final Course Examination) */}
      <AssessmentSetupModal
        isOpen={assessmentModal.open}
        onClose={() => setAssessmentModal({ open: false, sectionId: null, sectionTitle: '', isFinalExam: false, existingAssessment: null })}
        moduleId={selectedCourse?.id}
        sectionId={assessmentModal.sectionId}
        sectionTitle={assessmentModal.sectionTitle}
        isFinalExam={assessmentModal.isFinalExam}
        existingAssessment={assessmentModal.existingAssessment}
        onSaved={() => fetchCourseDetails(selectedCourse?.id)}
      />
    </div>
  );
}
