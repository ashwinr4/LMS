import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../services/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { CertificateCanvas } from '../../components/certificate/CertificateCanvas.jsx';
import { formatDate } from '../../utils/cn.js';
import {
  Award,
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  QrCode,
  Sparkles,
  Building2,
  Calendar,
  Copy,
  Check,
  GraduationCap,
  User,
  Hash,
} from 'lucide-react';

/**
 * Extracts a certificate code if the user inputs a full URL or query string.
 */
function extractCertificateCode(input) {
  if (!input || typeof input !== 'string') return '';
  let str = input.trim();

  // If a URL was pasted, parse out code or id param, or path segment
  if (str.includes('http://') || str.includes('https://') || str.includes('?')) {
    try {
      const url = str.startsWith('http') ? new URL(str) : new URL(str, 'https://dummy.com');
      const paramCode = url.searchParams.get('code') || url.searchParams.get('id');
      if (paramCode) return paramCode.trim();

      const pathSegments = url.pathname.split('/').filter(Boolean);
      if (pathSegments.length > 0 && pathSegments[pathSegments.length - 1] !== 'verify') {
        return pathSegments[pathSegments.length - 1].split('?')[0].trim();
      }
    } catch {
      const match = str.match(/[?&](?:code|id)=([^&]+)/i);
      if (match && match[1]) return decodeURIComponent(match[1]).trim();
    }
  }

  return str;
}

export default function CertificateVerify() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRaw = searchParams.get('code') || searchParams.get('id') || '';
  const [code, setCode] = useState(extractCertificateCode(initialRaw));
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const triggerVerification = async (rawInput) => {
    const cleanCode = extractCertificateCode(rawInput);
    if (!cleanCode) return;

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const { data } = await api.get(`/certificates/verify/${encodeURIComponent(cleanCode)}`);
      setResult(data.certificate);
      // Keep URL search query in sync for shareability
      setSearchParams({ code: cleanCode });
    } catch (err) {
      setError(err.response?.data?.message || 'Certificate record not found or invalid.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const urlParam = searchParams.get('code') || searchParams.get('id');
    if (urlParam) {
      const extracted = extractCertificateCode(urlParam);
      setCode(extracted);
      triggerVerification(extracted);
    }
  }, [searchParams]);

  const handleVerify = (e) => {
    e.preventDefault();
    triggerVerification(code);
  };

  const copyToClipboard = (text, type) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else if (type === 'hash') {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8 animate-fade-in px-4">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-semibold shadow-sm">
          <ShieldCheck className="h-4 w-4" />
          <span>Immutable SHA-256 Public Certificate Ledger</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-app">
          Public Certificate Verification
        </h1>
        <p className="text-xs sm:text-sm text-app-secondary max-w-lg mx-auto">
          Verify the authenticity, student identity, and tamper-proof cryptographic fingerprint of any Qualiva ESMMS credential.
        </p>
      </div>

      {/* Search Bar Form */}
      <div className="bg-card border border-app rounded-card p-6 sm:p-8 shadow-sm space-y-4">
        <form onSubmit={handleVerify} className="flex flex-col sm:flex-row items-center gap-3">
          <Input
            placeholder="Enter Certificate Code or Verification URL"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            leftIcon={<Award className="h-4 w-4 text-teal-500" />}
            containerClassName="flex-1"
            className="font-mono uppercase tracking-wider text-sm"
            required
          />
          <Button
            type="submit"
            size="md"
            isLoading={loading}
            leftIcon={<Search className="h-4 w-4" />}
            className="w-full sm:w-auto h-10 px-6"
          >
            Verify Credential
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-app-muted">
          <span>Sample test credentials:</span>
          <button
            type="button"
            onClick={() => {
              setCode('ESMMS-CERT-2026-D6B190');
              triggerVerification('ESMMS-CERT-2026-D6B190');
            }}
            className="font-mono text-brand-600 dark:text-brand-400 hover:underline font-bold px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/20"
          >
            ESMMS-CERT-2026-D6B190
          </button>
          <button
            type="button"
            onClick={() => {
              setCode('QLV-2026-00142');
              triggerVerification('QLV-2026-00142');
            }}
            className="font-mono text-teal-600 dark:text-teal-400 hover:underline font-bold px-1.5 py-0.5 rounded bg-teal-500/10 border border-teal-500/20"
          >
            QLV-2026-00142
          </button>
        </div>
      </div>

      {/* Humanized Error / Invalid Warning State */}
      {error && (
        <div className="p-6 bg-red-50 dark:bg-red-950/40 border-2 border-red-300 dark:border-red-800 rounded-card text-xs text-red-700 dark:text-red-300 space-y-3 animate-slide-up shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-red-800 dark:text-red-200">
                Certificate Not Found or Invalid
              </h4>
              <p className="text-xs text-red-700 dark:text-red-300">
                {error}
              </p>
            </div>
          </div>

          <div className="pl-8 pt-2 border-t border-red-200 dark:border-red-800/60 space-y-1.5 text-[11px] text-red-600/90 dark:text-red-400">
            <p className="font-semibold text-red-800 dark:text-red-200">Verification Tips:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>You can paste either the Certificate Code (e.g. <code>ESMMS-CERT-2026-XXXX</code> or <code>QLV-2026-XXXX</code>) or the full verification URL.</li>
              <li>Check for commonly confused characters such as number <code>0</code> and letter <code>O</code>, or number <code>1</code> and capital <code>I</code>.</li>
              <li>If the student recently completed the exam, the credential record updates instantaneously upon passing.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Valid Certificate Result Card & High-Resolution Canvas Preview */}
      {result && (
        <div className="space-y-6 animate-slide-up">
          {/* Top Verification Status Banner */}
          <div className="bg-card border-2 border-emerald-500/50 rounded-card p-6 shadow-dialog flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-app">Verified Authentic Credential</span>
                  <StatusBadge status="ACTIVE" label="Officially Verified" size="xs" />
                </div>
                <p className="text-xs text-app-muted mt-0.5 font-mono">
                  Credential ID: <strong className="text-app">{result.code}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono bg-elevated px-3 py-1.5 rounded-btn border border-app text-app-secondary self-start sm:self-center">
              <Calendar className="h-3.5 w-3.5 text-app-muted" />
              <span>Issued: {formatDate(result.issuedAt)}</span>
            </div>
          </div>

          {/* Comprehensive Verified Metadata Details Grid */}
          <div className="bg-card border border-app rounded-card p-6 sm:p-7 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-app pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-500" />
                <h3 className="text-sm font-bold text-app uppercase tracking-wider">
                  Official Credential Record
                </h3>
              </div>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Cryptographically Signed
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              {/* Recipient Student */}
              <div className="p-4 rounded-btn bg-surface-tertiary/60 dark:bg-dark-elevated/40 border border-app space-y-1">
                <span className="text-app-muted flex items-center gap-1.5 font-medium">
                  <User className="h-3.5 w-3.5 text-brand-500" />
                  Candidate / Recipient Name
                </span>
                <p className="text-base font-bold text-app">{result.studentName || 'Enterprise Candidate'}</p>
              </div>

              {/* Course Title */}
              <div className="p-4 rounded-btn bg-surface-tertiary/60 dark:bg-dark-elevated/40 border border-app space-y-1">
                <span className="text-app-muted flex items-center gap-1.5 font-medium">
                  <GraduationCap className="h-3.5 w-3.5 text-teal-500" />
                  Course Curriculum
                </span>
                <p className="text-base font-bold text-app">{result.courseTitle || 'Curriculum Certificate'}</p>
              </div>

              {/* Assessment Score */}
              <div className="p-4 rounded-btn bg-surface-tertiary/60 dark:bg-dark-elevated/40 border border-app space-y-1">
                <span className="text-app-muted flex items-center gap-1.5 font-medium">
                  <Award className="h-3.5 w-3.5 text-amber-500" />
                  Assessment Score Achieved
                </span>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {result.scoreAchieved !== undefined ? `${result.scoreAchieved}%` : 'Passing Grade'}
                  </span>
                  {result.scoreAchieved >= 90 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      Honors Distinction
                    </span>
                  )}
                </div>
              </div>

              {/* Department */}
              <div className="p-4 rounded-btn bg-surface-tertiary/60 dark:bg-dark-elevated/40 border border-app space-y-1">
                <span className="text-app-muted flex items-center gap-1.5 font-medium">
                  <Building2 className="h-3.5 w-3.5 text-blue-500" />
                  Issuing Department / Division
                </span>
                <p className="text-base font-bold text-app">{result.department || 'Enterprise Training & Security'}</p>
              </div>

              {/* Certificate Code */}
              <div className="p-4 rounded-btn bg-surface-tertiary/60 dark:bg-dark-elevated/40 border border-app space-y-1">
                <span className="text-app-muted flex items-center gap-1.5 font-medium">
                  <QrCode className="h-3.5 w-3.5 text-purple-500" />
                  Certificate Identification Code
                </span>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="font-mono font-bold text-app text-sm tracking-wide">{result.code}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(result.code, 'code')}
                    className="p-1 rounded text-app-muted hover:text-brand-500 hover:bg-surface-tertiary transition-colors"
                    title="Copy Certificate Code"
                  >
                    {copiedCode ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Issue Date */}
              <div className="p-4 rounded-btn bg-surface-tertiary/60 dark:bg-dark-elevated/40 border border-app space-y-1">
                <span className="text-app-muted flex items-center gap-1.5 font-medium">
                  <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                  Official Issuance Date
                </span>
                <p className="text-base font-bold text-app pt-0.5">{formatDate(result.issuedAt)}</p>
              </div>
            </div>

            {/* Cryptographic SHA-256 Ledger Section */}
            {result.verificationHash && (
              <div className="pt-2 border-t border-app space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-app flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-teal-500" />
                    Cryptographic Ledger Hash (SHA-256)
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(result.verificationHash, 'hash')}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {copiedHash ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span>Copied Hash!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy Signature</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3 bg-surface-tertiary/80 dark:bg-dark-elevated rounded-btn border border-app font-mono text-[11px] text-app-secondary break-all select-all leading-relaxed">
                  {result.verificationHash}
                </div>
                <p className="text-[11px] text-app-muted">
                  Tamper-proof cryptographic signature recorded on the Qualiva audit ledger. Any unauthorized modification to candidate details invalidates this signature.
                </p>
              </div>
            )}
          </div>

          {/* Dynamic Auto-Generated Certificate Preview & Download Engine */}
          <div className="pt-2">
            <h3 className="text-sm font-bold text-app mb-3 flex items-center gap-2">
              <Award className="h-4 w-4 text-brand-500" />
              Certificate Visual Render & Exporter
            </h3>
            <CertificateCanvas
              studentName={result.studentName}
              courseTitle={result.courseTitle}
              certificateCode={result.code}
              issuedAt={result.issuedAt}
              verificationHash={result.verificationHash}
            />
          </div>
        </div>
      )}
    </div>
  );
}
