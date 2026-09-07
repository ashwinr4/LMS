import { useRef, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '../ui/Button.jsx';
import { Download, ShieldCheck, Printer } from 'lucide-react';

/**
 * Universal Dynamic Certificate Canvas Engine
 * Calibrated precisely for the official enterprise certificate template (certi.png: 1492 x 1054 px).
 * Dynamically overlays real-time Student Name, Course Title, Certificate ID, Issue Date,
 * and a live scannable QR Code leading directly to the public certificate verification page.
 */
export function CertificateCanvas({
  studentName = 'Enterprise Graduate',
  courseTitle = 'Course Certificate',
  certificateCode = 'QLV-2026-00142',
  issuedAt = new Date().toISOString(),
  verificationHash = '',
  templateUrl = '/templates/certi.png',
}) {
  const canvasRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [rendered, setRendered] = useState(false);

  const formattedDate = new Date(issuedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  useEffect(() => {
    let isCancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Exact dimensions matching certi.png (1492 x 1054 px)
    const width = 1492;
    const height = 1054;
    canvas.width = width;
    canvas.height = height;

    const renderCertificate = async () => {
      // 1. Generate live scannable QR code
      const verifyUrl = `${window.location.origin}/verify?code=${encodeURIComponent(certificateCode)}`;
      let qrImg = null;
      try {
        const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
          margin: 1,
          width: 180,
          color: {
            dark: '#0F1E36',
            light: '#FFFFFF',
          },
        });
        qrImg = new Image();
        qrImg.src = qrDataUrl;
        await new Promise((res) => {
          qrImg.onload = res;
          qrImg.onerror = res;
        });
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }

      if (isCancelled) return;

      // 2. Load the template image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = templateUrl;

      const drawContent = (hasTemplate) => {
        ctx.clearRect(0, 0, width, height);

        if (hasTemplate) {
          // Draw the base official template
          ctx.drawImage(img, 0, 0, width, height);

          // ── Cleanly Mask Static Placeholders ───────────────────────
          ctx.fillStyle = '#FFFFFF';

          // A. Mask Student Name zone
          ctx.fillRect(300, 365, 892, 75);

          // B. Mask static "COURSE / PROGRAM NAME"
          ctx.fillRect(300, 488, 892, 48);

          // C. Mask static Certificate ID placeholder
          ctx.fillRect(470, 782, 252, 28);

          // D. Mask static Issue Date placeholder
          ctx.fillRect(770, 782, 252, 28);

          // E. Mask QR code square
          ctx.fillRect(701, 828, 90, 90);

          // F. Mask static verification URL line
          ctx.fillRect(540, 947, 412, 16);
        } else {
          // ── High-Fidelity Vector Fallback if image load fails ──────
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          ctx.strokeStyle = '#0F1E36';
          ctx.lineWidth = 12;
          ctx.strokeRect(30, 30, width - 60, height - 60);

          ctx.strokeStyle = '#C59B27';
          ctx.lineWidth = 3;
          ctx.strokeRect(45, 45, width - 90, height - 90);

          ctx.textAlign = 'center';
          ctx.fillStyle = '#0F1E36';
          ctx.font = 'bold 54px Georgia, serif';
          ctx.fillText('CERTIFICATE', width / 2, 170);

          ctx.fillStyle = '#C59B27';
          ctx.font = '600 22px Georgia, serif';
          ctx.fillText('— OF COMPLETION —', width / 2, 215);

          ctx.fillStyle = '#475569';
          ctx.font = '600 16px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillText('THIS IS TO CERTIFY THAT', width / 2, 310);

          ctx.fillText('HAS SUCCESSFULLY COMPLETED', width / 2, 465);

          ctx.font = 'italic 15px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillText(
            'demonstrating successful completion of the required curriculum and all assessment criteria.',
            width / 2,
            575
          );
        }

        // ── Render Dynamic Real-Time Values ──────────────────────────

        // 1. Recipient Student Name
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0F1E36';
        ctx.font = "bold 44px 'Playfair Display', Georgia, 'Times New Roman', serif";
        ctx.fillText(studentName || 'Student Name', 746, 416);

        // 2. Dynamic Course / Program Title
        const titleText = (courseTitle || 'Course Certificate').toUpperCase();
        const courseFontSize = titleText.length > 50 ? 22 : titleText.length > 35 ? 25 : 29;
        ctx.font = `bold ${courseFontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        ctx.fillStyle = '#0F1E36';
        ctx.fillText(titleText, 746, 518);

        // 3. Dynamic Certificate ID
        ctx.font = "700 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace";
        ctx.fillStyle = '#0F1E36';
        ctx.fillText(certificateCode, 596, 802);

        // 4. Dynamic Issue Date
        ctx.font = "600 17px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.fillStyle = '#0F1E36';
        ctx.fillText(formattedDate, 896, 802);

        // 5. Dynamic Scannable QR Code
        if (qrImg) {
          ctx.drawImage(qrImg, 701, 828, 90, 90);
        }

        // 6. Dynamic Verification URL Link Text
        ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.fillStyle = '#1D4ED8';
        const displayHost = window.location.host;
        ctx.fillText(`${displayHost}/verify?code=${certificateCode}`, 746, 958);

        setRendered(true);
      };

      img.onload = () => drawContent(true);
      img.onerror = () => drawContent(false);
    };

    renderCertificate();

    return () => {
      isCancelled = true;
    };
  }, [studentName, courseTitle, certificateCode, issuedAt, verificationHash, templateUrl]);

  // Download High-Resolution PNG (1492 x 1054)
  const handleDownloadPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    try {
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.download = `Certificate-${certificateCode}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  // Download Print-Ready PDF
  const handleDownloadPDF = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    try {
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Certificate - ${certificateCode}</title>
              <style>
                @page { size: landscape; margin: 0; }
                html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #ffffff; overflow: hidden; }
                body { display: flex; align-items: center; justify-content: center; }
                img { width: 100vw; height: 100vh; object-fit: contain; }
              </style>
            </head>
            <body>
              <img src="${dataUrl}" onload="setTimeout(() => { window.print(); window.close(); }, 300);" />
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Live Canvas Preview Frame */}
      <div className="relative rounded-card overflow-hidden border border-app shadow-dialog bg-surface p-1">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block rounded shadow-inner"
          style={{ aspectRatio: '1492 / 1054' }}
        />
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card border border-app rounded-card">
        <div className="flex items-center gap-2 text-xs text-app-secondary">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Real-time Verified Credential • Live Scannable QR</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleDownloadPNG}
            disabled={!rendered || downloading}
            leftIcon={<Download className="h-4 w-4" />}
          >
            Download PNG
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleDownloadPDF}
            disabled={!rendered || downloading}
            leftIcon={<Printer className="h-4 w-4" />}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-sm"
          >
            Download / Print PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
