import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { CertificateCanvas } from '../../components/certificate/CertificateCanvas.jsx';
import {
  Award,
  Printer,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';

export default function Certificates() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Official Graduation Certificates"
        description="Official verified credentials awarded upon successful completion of course curriculum and proctored examinations."
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
                  {/* Top Header with Topic next to Icon */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Award className="h-5 w-5 text-teal-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <h3 className="font-bold text-base text-app leading-snug">{cert.courseTitle}</h3>
                        <p className="text-xs text-app-secondary mt-0.5">
                          {cert.department || 'Enterprise Academy'} {cert.duration ? `• ${cert.duration}` : ''}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status="VERIFIED" size="xs" className="shrink-0" />
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
