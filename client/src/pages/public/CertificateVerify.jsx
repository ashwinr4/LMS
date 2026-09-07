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
} from 'lucide-react';

export default function CertificateVerify() {
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') || searchParams.get('id') || '';
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const triggerVerification = async (verifyCode) => {
    if (!verifyCode || !verifyCode.trim()) return;
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const { data } = await api.get(`/certificates/verify/${encodeURIComponent(verifyCode.trim())}`);
      setResult(data.certificate);
    } catch (err) {
      setError(err.response?.data?.message || 'Certificate not found or invalid.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const urlCode = searchParams.get('code') || searchParams.get('id');
    if (urlCode) {
      setCode(urlCode);
      triggerVerification(urlCode);
    }
  }, [searchParams]);

  const handleVerify = (e) => {
    e.preventDefault();
    triggerVerification(code);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-semibold">
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
            placeholder="Enter Certificate Code (e.g. QLV-2026-00142)"
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

        <div className="flex items-center gap-2 text-[11px] text-app-muted">
          <span>Sample test code:</span>
          <button
            type="button"
            onClick={() => setCode('QLV-2026-00142')}
            className="font-mono text-brand-600 dark:text-brand-400 hover:underline font-bold"
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
            <p className="font-semibold text-red-800 dark:text-red-200">Troubleshooting Tips:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Verify that the Certificate ID matches the exact format (e.g. <code>QLV-2026-XXXXX</code> or <code>ESMMS-CERT-XXXX</code>).</li>
              <li>Check for commonly confused characters such as number <code>0</code> and letter <code>O</code>, or number <code>1</code> and capital <code>I</code>.</li>
              <li>If you recently passed the course assessment, your credential record may take a few moments to sync across the network.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Valid Certificate Result Card & High-Resolution Canvas Preview */}
      {result && (
        <div className="space-y-6 animate-slide-up">
          {/* Certificate Metadata Verification Banner */}
          <div className="bg-card border-2 border-emerald-500/50 rounded-card p-6 shadow-dialog flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center font-bold">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-app">Verified Credential</span>
                  <StatusBadge status="ACTIVE" label="Authentic" size="xs" />
                </div>
                <p className="text-xs text-app-muted mt-0.5 font-mono">
                  Certificate ID: <strong className="text-app">{result.code}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono bg-elevated px-3 py-1.5 rounded-btn border border-app text-app-secondary">
              <Calendar className="h-3.5 w-3.5 text-app-muted" />
              <span>Issued: {formatDate(result.issuedAt)}</span>
            </div>
          </div>

          {/* Dynamic Auto-Generated Certificate Preview & Download Engine */}
          <CertificateCanvas
            studentName={result.studentName}
            courseTitle={result.courseTitle}
            certificateCode={result.code}
            issuedAt={result.issuedAt}
            verificationHash={result.verificationHash}
          />
        </div>
      )}
    </div>
  );
}
