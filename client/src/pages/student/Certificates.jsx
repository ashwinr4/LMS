import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { CertificateCanvas } from '../../components/certificate/CertificateCanvas.jsx';
import {
  Award,
  ShieldCheck,
  Download,
  Printer,
  ExternalLink,
  Calendar,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  FileCheck2,
  BookOpen,
} from 'lucide-react';

export default function Certificates() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [previewCert, setPreviewCert] = useState(null);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/certificates/my-certificates');
      if (res.data.success) {
        setCertificates(res.data.certificates || []);
      }
    } catch (err) {
      console.error('Failed to fetch certificates:', err);
      setError(err.response?.data?.message || 'Failed to load certificates.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Official Graduation Certificates"
        description="Tamper-proof cryptographic credentials backed by immutable SHA-256 hashing. All certificates are globally verifiable."
      />

      {loading ? (
        <div className="grid md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-card border border-app rounded-card p-6 animate-pulse space-y-4">
              <div className="h-6 bg-surface-tertiary rounded w-1/3" />
              <div className="h-5 bg-surface-tertiary rounded w-3/4" />
              <div className="h-16 bg-surface-tertiary rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 bg-red-500/10 border border-red-500/30 rounded-card text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchCertificates}>
            Try Again
          </Button>
        </div>
      ) : certificates.length === 0 ? (
        <div className="p-12 bg-card border border-app rounded-card text-center space-y-4">
          <Award className="h-12 w-12 text-app-muted mx-auto" />
          <h3 className="text-base font-bold text-app">No Certificates Issued Yet</h3>
          <p className="text-sm text-app-secondary max-w-md mx-auto">
            Complete course lessons and pass the final proctored examination (≥80%) to earn your verified cryptographic certificate.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {certificates.map((cert) => {
            const isHonors = cert.scoreAchieved >= 90;
            return (
              <div
                key={cert.id}
                className="bg-card border-2 border-teal-500/30 rounded-card p-6 space-y-5 shadow-sm hover:shadow-dialog transition-all duration-200 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Top Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-teal-500" />
                      <span className="font-mono text-xs font-bold text-app bg-surface-tertiary dark:bg-dark-elevated px-2 py-0.5 rounded border border-app">
                        {cert.code}
                      </span>
                    </div>
                    <StatusBadge status="VERIFIED" size="xs" />
                  </div>

                  {/* Course Title */}
                  <div>
                    <h3 className="font-bold text-base text-app">{cert.courseTitle}</h3>
                    <p className="text-xs text-app-secondary mt-0.5">
                      {cert.department || 'Enterprise Academy'} {cert.duration ? `• ${cert.duration}` : ''}
                    </p>
                  </div>

                  {/* Score & Issue Details Card */}
                  <div className="p-3.5 rounded-btn bg-surface-tertiary/60 dark:bg-dark-elevated/40 border border-app text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-app-secondary">Score Achieved:</span>
                      <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                        {cert.scoreAchieved}% {isHonors ? '(Honors Distinction)' : '(Passed)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-app-secondary">Issued On:</span>
                      <span className="text-app font-medium">
                        {new Date(cert.issuedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* SHA-256 Hash Box */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-app-secondary font-medium">
                      <span>Cryptographic SHA-256 Hash:</span>
                      <button
                        onClick={() => handleCopy(cert.verificationHash, cert.id)}
                        className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                      >
                        {copiedCode === cert.id ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-500" />
                            <span className="text-emerald-500">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy Hash</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="p-2.5 bg-surface dark:bg-dark-surface rounded border border-app text-[10px] font-mono text-app-muted truncate select-all">
                      {cert.verificationHash}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-app">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Printer className="h-4 w-4" />}
                    onClick={() => setPreviewCert(cert)}
                    className="w-1/2"
                  >
                    View & Print
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<ExternalLink className="h-4 w-4" />}
                    onClick={() => window.open(`/verify?code=${cert.code}`, '_blank')}
                    className="w-1/2"
                  >
                    Public Verify
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Official Certificate Printable Modal */}
      {previewCert && (
        <Modal
          isOpen={!!previewCert}
          onClose={() => setPreviewCert(null)}
          title="Official Certificate of Completion"
        >
          <div className="space-y-4">
            <CertificateCanvas
              studentName={previewCert.studentName}
              courseTitle={previewCert.courseTitle}
              certificateCode={previewCert.code}
              issuedAt={previewCert.issuedAt}
              verificationHash={previewCert.verificationHash}
              templateUrl="/templates/certi.png"
            />
            <div className="flex items-center justify-end pt-2">
              <Button variant="secondary" onClick={() => setPreviewCert(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
