import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../utils/cn.js';
import {
  ChevronLeft, ChevronRight, CheckCircle2, Lock, Menu, X,
  Video, FileText, Youtube, File, Clock, BookOpen,
  Award, ArrowRight, Play, Download, Loader2, Image as ImageIcon,
  AlertTriangle, ShieldAlert, Check, Sparkles, ExternalLink, RefreshCw,
} from 'lucide-react';

// ── Markdown Renderer (Clean, Accessible Typography) ──────────────
function MarkdownRenderer({ content }) {
  const html = (content || '')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-6 mb-3 tracking-tight">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-5 mb-2">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900 dark:text-slate-100">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono text-indigo-600 dark:text-indigo-400">$1</code>')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto text-xs font-mono my-4 text-slate-100"><code>$2</code></pre>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-slate-700 dark:text-slate-300 list-disc text-sm leading-relaxed my-1">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-slate-700 dark:text-slate-300 list-decimal text-sm leading-relaxed my-1">$1</li>')
    .replace(/\n\n/g, '</p><p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed my-3">')
    .replace(/^(?!<[hlpcli])(.+)$/gm, '<p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed my-2">$1</p>');

  return (
    <div
      className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── YouTube URL Parser ──────────────────────────────────────
function getYouTubeId(url) {
  const match = url?.match(
    /(?:youtube\.com\/(?:[^/]+\/\S+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

// ── Resolve Media File URL ──────────────────────────────────
function resolveMediaUrl(url) {
  if (!url) return '';
  // Fallback for previous simulated placeholder URLs from older test data
  if (url.includes('storage.qualiva.io/videos/')) {
    return '/uploads/lessons/sample-video.mp4';
  }
  if (url.includes('storage.qualiva.io/documents/')) {
    return '/uploads/lessons/sample-doc.pdf';
  }
  return url;
}

// ── Format Seconds to MM:SS ──────────────────────────────────
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ── Lesson Type Icon ─────────────────────────────────────────
function LessonIcon({ type, className }) {
  const map = {
    VIDEO: <Video className={cn('h-4 w-4 text-indigo-500 dark:text-indigo-400', className)} />,
    YOUTUBE: <Youtube className={cn('h-4 w-4 text-red-500 dark:text-red-400', className)} />,
    MARKDOWN: <FileText className={cn('h-4 w-4 text-emerald-500 dark:text-emerald-400', className)} />,
    TEXT: <FileText className={cn('h-4 w-4 text-slate-500 dark:text-slate-400', className)} />,
    DOCUMENT: <File className={cn('h-4 w-4 text-blue-500 dark:text-blue-400', className)} />,
    PDF: <File className={cn('h-4 w-4 text-rose-500 dark:text-rose-400', className)} />,
    IMAGE: <ImageIcon className={cn('h-4 w-4 text-teal-500 dark:text-teal-400', className)} />,
  };
  return map[type] || <FileText className={cn('h-4 w-4 text-slate-500', className)} />;
}

// ── Main Learning Player ─────────────────────────────────────
export default function LearningPlayer() {
  const { moduleId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [module, setModule] = useState(null);
  const [progress, setProgress] = useState({ completedLessons: [], progress: 0, lastActive: null });
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [currentLessonIdx, setCurrentLessonIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [readPercent, setReadPercent] = useState(0);
  const [videoError, setVideoError] = useState(false);

  // Real-time video progress & anti-skip state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [maxWatchedTime, setMaxWatchedTime] = useState(0);
  const [showAntiSkipWarning, setShowAntiSkipWarning] = useState(false);
  const [unlockedSuccess, setUnlockedSuccess] = useState(false);

  const videoRef = useRef(null);
  const contentRef = useRef(null);
  const maxWatchedTimeRef = useRef(0);
  const progressSaveTimer = useRef(null);

  // Derive flat lesson list and current lesson
  const allLessons = module?.sections?.flatMap((s, si) =>
    s.lessons.map((l, li) => ({ ...l, sectionIdx: si, lessonIdx: li, sectionTitle: s.title }))
  ) || [];

  const currentLesson = module?.sections?.[currentSectionIdx]?.lessons?.[currentLessonIdx];
  const currentLessonKey = `${currentSectionIdx}_${currentLessonIdx}`;
  const isCompleted = progress.completedLessons.includes(currentLessonKey);
  const totalLessons = allLessons.length;
  const completedCount = progress.completedLessons.length;

  // Reset video progress tracking when lecture changes
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setMaxWatchedTime(0);
    maxWatchedTimeRef.current = 0;
    setShowAntiSkipWarning(false);
    setUnlockedSuccess(false);
    setVideoError(false);
  }, [currentSectionIdx, currentLessonIdx]);

  // Check if a lesson is locked (sequential: must complete previous)
  const isLessonLocked = (sIdx, lIdx) => {
    if (sIdx === 0 && lIdx === 0) return false; // First lesson always unlocked
    const key = `${sIdx}_${lIdx}`;
    if (progress.completedLessons.includes(key)) return false;
    const flatIdx = allLessons.findIndex(
      (l) => l.sectionIdx === sIdx && l.lessonIdx === lIdx
    );
    if (flatIdx <= 0) return false;
    const prev = allLessons[flatIdx - 1];
    return !progress.completedLessons.includes(`${prev.sectionIdx}_${prev.lessonIdx}`);
  };

  // Fetch course & progress data
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [modRes, progRes] = await Promise.all([
          api.get(`/modules/${moduleId}`),
          api.get(`/modules/${moduleId}/progress`),
        ]);
        setModule(modRes.data.module);

        const prog = progRes.data;
        setProgress({
          completedLessons: prog.completedLessons || [],
          progress: prog.progress || 0,
          lastActive: prog.lastActive,
        });

        // Restore last position
        if (prog.lastActive) {
          setCurrentSectionIdx(prog.lastActive.sectionIdx || 0);
          setCurrentLessonIdx(prog.lastActive.lessonIdx || 0);
        }
      } catch (err) {
        console.error('Failed to load course:', err);
      } finally {
        setLoading(false);
      }
    }
    if (moduleId) load();
  }, [moduleId]);

  // Anti-skip time update handler
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 1;
    setCurrentTime(curr);
    setDuration(dur);

    // If lecture is not yet completed, strictly clamp forward seeking
    if (!isCompleted) {
      if (curr > maxWatchedTimeRef.current + 1.2) {
        videoRef.current.currentTime = maxWatchedTimeRef.current;
        setShowAntiSkipWarning(true);
        setTimeout(() => setShowAntiSkipWarning(false), 2500);
        return;
      }
      if (curr > maxWatchedTimeRef.current) {
        maxWatchedTimeRef.current = curr;
        setMaxWatchedTime(curr);
      }
    }
  };

  // Anti-skip seeking interceptor
  const handleSeeking = () => {
    if (!videoRef.current || isCompleted) return;
    if (videoRef.current.currentTime > maxWatchedTimeRef.current + 1) {
      videoRef.current.currentTime = maxWatchedTimeRef.current;
      setShowAntiSkipWarning(true);
      setTimeout(() => setShowAntiSkipWarning(false), 2500);
    }
  };

  // Track scroll progress for text/markdown lessons
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handleScroll = () => {
      const scrolled = el.scrollTop / (el.scrollHeight - el.clientHeight || 1);
      setReadPercent(Math.round(Math.min(scrolled * 100, 100)));
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [currentLesson]);

  // Save video timestamp every 5 seconds (heartbeat only, does not mark complete)
  const saveTimestamp = useCallback(() => {
    if (!videoRef.current || !currentLesson) return;
    const timestamp = Math.floor(videoRef.current.currentTime);
    api.post(`/modules/lessons/${currentLesson.id}/complete`, {
      moduleId,
      sectionIdx: currentSectionIdx,
      lessonIdx: currentLessonIdx,
      timestamp,
      markAsFinished: false,
    }).catch(() => {});
  }, [currentLesson, moduleId, currentSectionIdx, currentLessonIdx]);

  useEffect(() => {
    if (currentLesson?.type === 'VIDEO' || currentLesson?.type === 'YOUTUBE') {
      progressSaveTimer.current = setInterval(saveTimestamp, 5000);
    }
    return () => clearInterval(progressSaveTimer.current);
  }, [currentLesson, saveTimestamp]);

  // Mark lesson complete and unlock next sequential lecture
  const markComplete = async () => {
    if (!currentLesson || isCompleted) return;
    setMarkingComplete(true);
    try {
      const timestamp = videoRef.current ? Math.floor(videoRef.current.currentTime) : 0;
      const { data } = await api.post(`/modules/lessons/${currentLesson.id}/complete`, {
        moduleId,
        sectionIdx: currentSectionIdx,
        lessonIdx: currentLessonIdx,
        timestamp,
        markAsFinished: true,
      });
      setProgress((prev) => ({
        ...prev,
        completedLessons: data.completedLessons,
        progress: data.progress,
      }));
      setUnlockedSuccess(true);

      // Auto-advance to next sequential lesson
      setTimeout(() => {
        const flatIdx = allLessons.findIndex(
          (l) => l.sectionIdx === currentSectionIdx && l.lessonIdx === currentLessonIdx
        );
        if (flatIdx < allLessons.length - 1) {
          const next = allLessons[flatIdx + 1];
          setCurrentSectionIdx(next.sectionIdx);
          setCurrentLessonIdx(next.lessonIdx);
        }
      }, 1200);
    } catch (err) {
      console.error('Failed to mark complete:', err);
    } finally {
      setMarkingComplete(false);
    }
  };

  // Navigate prev/next
  const navigate_ = (direction) => {
    const flatIdx = allLessons.findIndex(
      (l) => l.sectionIdx === currentSectionIdx && l.lessonIdx === currentLessonIdx
    );
    const target = allLessons[flatIdx + direction];
    if (target) {
      if (direction > 0 && isLessonLocked(target.sectionIdx, target.lessonIdx)) {
        return;
      }
      setCurrentSectionIdx(target.sectionIdx);
      setCurrentLessonIdx(target.lessonIdx);
      setReadPercent(0);
    }
  };

  const flatIdx = allLessons.findIndex(
    (l) => l.sectionIdx === currentSectionIdx && l.lessonIdx === currentLessonIdx
  );

  const videoProgressPercent = duration > 0 ? Math.min(Math.round((currentTime / duration) * 100), 100) : 0;
  const resolvedMediaUrl = resolveMediaUrl(currentLesson?.videoUrl);
  const isPdfDocument = currentLesson?.documentName?.toLowerCase().endsWith('.pdf') || resolvedMediaUrl.toLowerCase().endsWith('.pdf');

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Preparing learning environment...</p>
        </div>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="text-center py-24 max-w-md mx-auto">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Course Not Found</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">You might not be enrolled in this course or it is currently unavailable.</p>
        <Link to="/courses"><Button>Explore Course Catalog</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-0 animate-fade-in -m-4 sm:-m-6 lg:-m-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── Refined Top Header ─────────────────────────── */}
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/my-courses"
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-medium"
            title="Return to My Courses"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">My Courses</span>
          </Link>

          <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-indigo-400 tracking-wide uppercase">
              {module.code}
            </span>
            <h1 className="text-sm font-semibold text-slate-100 truncate max-w-xs sm:max-w-md">
              {module.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Progress Indicator */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs font-medium text-slate-200 block">
                {completedCount} of {totalLessons} completed
              </span>
              <span className="text-[10px] text-slate-400">
                {progress.progress >= 80 ? 'Exam Eligible' : '80% required for exam'}
              </span>
            </div>

            <div className="w-28 bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700/60">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              />
            </div>

            <span className="text-xs font-semibold text-indigo-400 min-w-[32px] text-right">
              {progress.progress}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSidebarOpen((p) => !p)}
            className="p-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors flex items-center gap-1.5 text-xs"
            title={sidebarOpen ? 'Hide Course Curriculum' : 'Show Course Curriculum'}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="hidden md:inline">{sidebarOpen ? 'Hide Playlist' : 'Playlist'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Player & Content Grid ─────────────────── */}
      <div className={cn('flex min-h-[calc(100vh-61px)]', sidebarOpen ? 'lg:grid lg:grid-cols-[1fr_360px]' : '')}>
        {/* ── Lecture Stage (Center) ────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-y-auto" ref={contentRef}>
          <div className="max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
            
            {/* 🎬 1. VIDEO PLAYER STAGE */}
            {currentLesson?.type === 'VIDEO' && (
              <div className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800/80 shadow-2xl relative">
                {/* Anti-Skip Notice Toast */}
                {showAntiSkipWarning && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-amber-500 text-slate-950 px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-2 shadow-lg backdrop-blur animate-fade-in">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>Please watch the lecture to advance forward. Fast-forwarding is restricted until completed.</span>
                  </div>
                )}

                {/* Completion Toast */}
                {unlockedSuccess && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-2 shadow-lg animate-fade-in">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span>Lecture completed! Advancing to the next lesson...</span>
                  </div>
                )}

                {/* Video Component */}
                {resolvedMediaUrl && !videoError ? (
                  <div className="relative bg-black flex items-center justify-center">
                    <video
                      ref={videoRef}
                      key={resolvedMediaUrl}
                      src={resolvedMediaUrl}
                      controls
                      controlsList="nodownload noplaybackrate"
                      disablePictureInPicture
                      className="w-full max-h-[64vh] aspect-video object-contain"
                      onTimeUpdate={handleTimeUpdate}
                      onSeeking={handleSeeking}
                      onEnded={markComplete}
                      onError={() => setVideoError(true)}
                    />
                  </div>
                ) : (
                  <div className="py-20 px-6 text-center bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center gap-3">
                    <AlertTriangle className="h-10 w-10 text-amber-500" />
                    <h3 className="text-base font-semibold text-slate-200">Video Lecture Unavailable</h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      The video file could not be streamed or has not yet been uploaded by the course creator.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setVideoError(false);
                        if (videoRef.current) videoRef.current.load();
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium transition-colors border border-slate-700"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Retry Playback
                    </button>
                  </div>
                )}

                {/* Clean, Non-Intrusive Video Timeline Info */}
                {resolvedMediaUrl && !videoError && (
                  <div className="bg-slate-900 border-t border-slate-800 px-5 py-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-indigo-500" />
                        <span>Lecture Timeline</span>
                      </span>
                      <span className="text-slate-200 font-semibold">
                        {formatTime(currentTime)} / {formatTime(duration)} ({videoProgressPercent}%)
                      </span>
                    </div>

                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full rounded-full transition-all duration-150"
                        style={{ width: `${videoProgressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ▶️ 2. YOUTUBE VIDEO STAGE */}
            {currentLesson?.type === 'YOUTUBE' && currentLesson.videoUrl && (
              <div className="rounded-xl overflow-hidden bg-black border border-slate-800/80 shadow-2xl relative">
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    key={currentLesson.videoUrl}
                    className="absolute inset-0 w-full h-full"
                    src={`https://www.youtube.com/embed/${getYouTubeId(currentLesson.videoUrl)}?rel=0&modestbranding=1`}
                    title={currentLesson.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            {/* 📄 3. DOCUMENT / PDF VIEWER */}
            {(currentLesson?.type === 'DOCUMENT' || currentLesson?.type === 'PDF') && (
              <div className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800/80 p-6 sm:p-8 space-y-6">
                {isPdfDocument && resolvedMediaUrl ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <File className="h-5 w-5 text-rose-500 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-slate-200">
                            {currentLesson.documentName || 'Document Reading Material'}
                          </p>
                          <p className="text-[11px] text-slate-400">PDF Document Reference</p>
                        </div>
                      </div>

                      <a
                        href={resolvedMediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Open in New Tab</span>
                      </a>
                    </div>

                    <div className="w-full h-[62vh] rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                      <iframe
                        src={resolvedMediaUrl}
                        title={currentLesson.title}
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center text-center max-w-md mx-auto space-y-4">
                    <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-indigo-400">
                      <File className="h-12 w-12" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-100">
                        {currentLesson?.documentName || currentLesson?.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Course Reference Document & Handout
                      </p>
                    </div>

                    {resolvedMediaUrl && (
                      <a
                        href={resolvedMediaUrl}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md transition-colors"
                      >
                        <Download className="h-4 w-4" /> Download Document
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 📝 4. MARKDOWN / ARTICLE NOTES */}
            {(currentLesson?.type === 'MARKDOWN' || currentLesson?.type === 'TEXT') && (
              <div className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800/80 p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between text-xs text-slate-400 font-medium pb-4 border-b border-slate-800">
                  <span>Reading Progress</span>
                  <span className="text-slate-200 font-semibold">{readPercent}%</span>
                </div>

                {currentLesson.content ? (
                  <MarkdownRenderer content={currentLesson.content} />
                ) : (
                  <p className="text-sm text-slate-400">No article text provided for this section.</p>
                )}
              </div>
            )}

            {/* 🖼️ 5. IMAGE / DIAGRAM LESSON */}
            {currentLesson?.type === 'IMAGE' && (
              <div className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800/80 p-6 flex flex-col items-center justify-center">
                <img
                  src={resolvedMediaUrl}
                  alt={currentLesson.title}
                  className="max-h-[65vh] object-contain rounded-lg"
                />
              </div>
            )}

            {/* ── Lesson Details & Next Steps Bar ─────────────── */}
            <div className="rounded-xl bg-slate-900 border border-slate-800/80 p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wide block mb-1">
                    {module.sections?.[currentSectionIdx]?.title.startsWith('Section')
                      ? module.sections?.[currentSectionIdx]?.title
                      : `Section ${currentSectionIdx + 1}: ${module.sections?.[currentSectionIdx]?.title}`}
                  </span>
                  <h2 className="text-lg font-bold text-slate-100">{currentLesson?.title}</h2>
                  {currentLesson?.duration && (
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{currentLesson.duration}</span>
                    </p>
                  )}
                </div>

                {isCompleted && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800 text-emerald-400 text-xs font-medium self-start sm:self-center">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Completed</span>
                  </div>
                )}
              </div>

              {currentLesson?.notes && (
                <div className="p-4 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300 space-y-1">
                  <p className="font-semibold text-slate-200">Instructor Takeaways & Overview</p>
                  <p className="leading-relaxed">{currentLesson.notes}</p>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate_(-1)}
                  disabled={flatIdx === 0}
                  leftIcon={<ChevronLeft className="h-4 w-4" />}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
                >
                  Previous
                </Button>

                {!isCompleted ? (
                  currentLesson?.type === 'VIDEO' ? (
                    duration > 0 && currentTime >= duration - 2 ? (
                      <Button
                        size="sm"
                        isLoading={markingComplete}
                        onClick={markComplete}
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                        className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md"
                      >
                        Mark Complete & Continue
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled
                        leftIcon={<Lock className="h-3.5 w-3.5 text-slate-400" />}
                        className="flex-1 sm:flex-none bg-slate-800/80 border border-slate-700/80 text-slate-400 cursor-not-allowed opacity-75"
                        title="Watch the full lecture to complete and unlock the next lesson"
                      >
                        Watch to Complete {duration > 0 ? `(${videoProgressPercent}%)` : ''}
                      </Button>
                    )
                  ) : (
                    <Button
                      size="sm"
                      isLoading={markingComplete}
                      onClick={markComplete}
                      leftIcon={<CheckCircle2 className="h-4 w-4" />}
                      className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md"
                    >
                      Mark Complete & Continue
                    </Button>
                  )
                ) : (
                  <Button
                    size="sm"
                    onClick={() => navigate_(1)}
                    disabled={flatIdx === allLessons.length - 1}
                    rightIcon={<ChevronRight className="h-4 w-4" />}
                    className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md"
                  >
                    Next Lecture
                  </Button>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Curriculum Playlist (Sidebar) ──────────────── */}
        {sidebarOpen && (
          <aside className="hidden lg:flex flex-col w-[360px] border-l border-slate-800 bg-slate-900 overflow-y-auto">
            <div className="p-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10 backdrop-blur">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Course Curriculum
                </h3>
                <span className="text-[11px] font-semibold text-indigo-400">
                  {progress.progress}% Complete
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {completedCount} of {totalLessons} lectures finished
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {module.sections?.map((section, sIdx) => {
                const sectionNumber = sIdx + 1;
                const sectionLessons = section.lessons || [];
                const completedInSection = sectionLessons.filter((l, li) =>
                  progress.completedLessons.includes(`${sIdx}_${li}`)
                ).length;

                return (
                  <div key={section.id} className="border-b border-slate-800/80">
                    {/* Clean Section Header */}
                    <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 truncate pr-2">
                        {section.title.startsWith('Section')
                          ? section.title
                          : `Section ${sectionNumber}: ${section.title}`}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium shrink-0">
                        {completedInSection}/{sectionLessons.length}
                      </span>
                    </div>

                    {/* Section Lessons List */}
                    <div className="divide-y divide-slate-800/40">
                      {sectionLessons.map((lesson, lIdx) => {
                        const key = `${sIdx}_${lIdx}`;
                        const completed = progress.completedLessons.includes(key);
                        const locked = isLessonLocked(sIdx, lIdx);
                        const active = currentSectionIdx === sIdx && currentLessonIdx === lIdx;

                        return (
                          <button
                            key={lesson.id}
                            type="button"
                            disabled={locked}
                            onClick={() => {
                              setCurrentSectionIdx(sIdx);
                              setCurrentLessonIdx(lIdx);
                              setReadPercent(0);
                            }}
                            className={cn(
                              'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                              active
                                ? 'bg-indigo-950/50 border-l-4 border-l-indigo-500'
                                : 'hover:bg-slate-800/40',
                              locked ? 'opacity-40 cursor-not-allowed bg-slate-950/40' : 'cursor-pointer'
                            )}
                          >
                            <div className="shrink-0">
                              {completed ? (
                                <span className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
                                  <Check className="h-3 w-3 stroke-[2.5]" />
                                </span>
                              ) : locked ? (
                                <span className="h-5 w-5 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center">
                                  <Lock className="h-2.5 w-2.5" />
                                </span>
                              ) : active ? (
                                <span className="h-5 w-5 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                                  <Play className="h-2.5 w-2.5 fill-current ml-0.5" />
                                </span>
                              ) : (
                                <span className="h-5 w-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-medium">
                                  {lIdx + 1}
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  'text-xs truncate',
                                  active
                                    ? 'text-white font-semibold'
                                    : completed
                                    ? 'text-slate-300'
                                    : 'text-slate-200'
                                )}
                              >
                                {lesson.title}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                <span className="uppercase font-medium tracking-wide">
                                  {lesson.type}
                                </span>
                                {lesson.duration && (
                                  <span>• {lesson.duration}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Compulsory Final Examination Banner */}
              {(() => {
                const finalExam = (module.assessments || []).find(
                  (a) => a.description === 'FINAL_EXAM' || a.title?.toLowerCase().includes('final')
                );
                if (!finalExam) return null;
                const canTakeExam = progress.progress >= 80;
                return (
                  <div className="p-4 border-t border-slate-800 bg-slate-900/80 space-y-2 mt-4">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                      <span className="flex items-center gap-1.5">
                        <Award className="h-4 w-4 text-indigo-400" />
                        Final Course Exam
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {canTakeExam
                        ? 'Curriculum completed! You are now eligible to take the final assessment for certificate issuance.'
                        : `Complete at least 80% of curriculum to unlock examination (Current: ${progress.progress}%).`}
                    </p>
                    {canTakeExam ? (
                      <Link to={`/assessments/${finalExam.id}/exam`}>
                        <Button size="xs" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                          Take Final Exam Now →
                        </Button>
                      </Link>
                    ) : (
                      <Button size="xs" disabled className="w-full bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed">
                        Exam Locked (Complete 80%)
                      </Button>
                    )}
                  </div>
                );
              })()}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
