import { useRef, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '../ui/Button.jsx';
import { CustomDropdown } from '../ui/CustomDropdown.jsx';
import { Download, ShieldCheck, Printer } from 'lucide-react';

/**
 * Universal Dynamic Certificate Canvas Engine
 * Calibrated precisely for the official enterprise certificate template (certi.png: 1492 x 1054 px).
 * Dynamically overlays real-time Student Name, Course Title, Certificate ID, Issue Date,
 * and a live scannable QR Code leading directly to the public certificate verification page.
 */
// Universal Binary Exporters for High-Fidelity Formats
function triggerDownload(blobOrDataUrl, filename) {
  const url = typeof blobOrDataUrl === 'string' ? blobOrDataUrl : URL.createObjectURL(blobOrDataUrl);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (typeof blobOrDataUrl !== 'string') {
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

// Pure JS Baseline TIFF 6.0 24-bit RGB Serializer
function canvasToTIFFBlob(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, width, height);
  const rgba = imgData.data;

  const numEntries = 12;
  const headerSize = 8;
  const ifdSize = 2 + numEntries * 12 + 4;
  const extraDataSize = 6 + 8 + 8; // BitsPerSample(6) + XRes(8) + YRes(8)
  const dataOffset = headerSize + ifdSize + extraDataSize;
  const imageByteCount = width * height * 3;
  const totalFileSize = dataOffset + imageByteCount;

  const buffer = new ArrayBuffer(totalFileSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Header ("II" - Little Endian)
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  // IFD
  let offset = 8;
  view.setUint16(offset, numEntries, true);
  offset += 2;

  const bitsOffset = headerSize + ifdSize;
  const xResOffset = bitsOffset + 6;
  const yResOffset = xResOffset + 8;

  function writeTag(tag, type, count, valOrOffset) {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    view.setUint32(offset + 8, valOrOffset, true);
    offset += 12;
  }

  writeTag(0x0100, 4, 1, width);              // ImageWidth
  writeTag(0x0101, 4, 1, height);             // ImageLength
  writeTag(0x0102, 3, 3, bitsOffset);         // BitsPerSample (8, 8, 8)
  writeTag(0x0103, 3, 1, 1);                  // Compression (1 = none)
  writeTag(0x0106, 3, 1, 2);                  // PhotometricInterpretation (2 = RGB)
  writeTag(0x0111, 4, 1, dataOffset);         // StripOffsets
  writeTag(0x0115, 3, 1, 3);                  // SamplesPerPixel (3 = RGB)
  writeTag(0x0116, 4, 1, height);             // RowsPerStrip
  writeTag(0x0117, 4, 1, imageByteCount);     // StripByteCounts
  writeTag(0x011A, 5, 1, xResOffset);         // XResolution
  writeTag(0x011B, 5, 1, yResOffset);         // YResolution
  writeTag(0x011C, 3, 1, 1);                  // PlanarConfiguration (1 = chunky)

  view.setUint32(offset, 0, true);

  // Extra data values
  view.setUint16(bitsOffset, 8, true);
  view.setUint16(bitsOffset + 2, 8, true);
  view.setUint16(bitsOffset + 4, 8, true);

  view.setUint32(xResOffset, 300, true);
  view.setUint32(xResOffset + 4, 1, true);

  view.setUint32(yResOffset, 300, true);
  view.setUint32(yResOffset + 4, 1, true);

  // Write pixel RGB data
  let p = dataOffset;
  for (let i = 0; i < rgba.length; i += 4) {
    bytes[p++] = rgba[i];
    bytes[p++] = rgba[i + 1];
    bytes[p++] = rgba[i + 2];
  }

  return new Blob([buffer], { type: 'image/tiff' });
}

// Pure JS ISO-32000 Landscape PDF Binary Serializer
function canvasToPDFBlob(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const base64Data = dataUrl.split(',')[1];
  const binaryString = window.atob(base64Data);
  const jpegBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    jpegBytes[i] = binaryString.charCodeAt(i);
  }

  const contentStream = `q\n${width} 0 0 ${height} 0 0 cm\n/Img Do\nQ\n`;
  const enc = new TextEncoder();

  const header = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;
  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Img 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`;
  const obj4Header = `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`;
  const obj4Footer = `\nendstream\nendobj\n`;
  const obj5 = `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`;

  const hBytes = enc.encode(header);
  const o1Bytes = enc.encode(obj1);
  const o2Bytes = enc.encode(obj2);
  const o3Bytes = enc.encode(obj3);
  const o4HBytes = enc.encode(obj4Header);
  const o4FBytes = enc.encode(obj4Footer);
  const o5Bytes = enc.encode(obj5);

  const offset1 = hBytes.length;
  const offset2 = offset1 + o1Bytes.length;
  const offset3 = offset2 + o2Bytes.length;
  const offset4 = offset3 + o3Bytes.length;
  const offset5 = offset4 + o4HBytes.length + jpegBytes.length + o4FBytes.length;
  const xrefOffset = offset5 + o5Bytes.length;

  const pad10 = (n) => String(n).padStart(10, '0');
  const xref = `xref\n0 6\n0000000000 65535 f \n${pad10(offset1)} 00000 n \n${pad10(offset2)} 00000 n \n${pad10(offset3)} 00000 n \n${pad10(offset4)} 00000 n \n${pad10(offset5)} 00000 n \n`;
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const xrefBytes = enc.encode(xref);
  const trailerBytes = enc.encode(trailer);

  const totalLength = xrefOffset + xrefBytes.length + trailerBytes.length;
  const fullBuffer = new Uint8Array(totalLength);

  let cur = 0;
  fullBuffer.set(hBytes, cur); cur += hBytes.length;
  fullBuffer.set(o1Bytes, cur); cur += o1Bytes.length;
  fullBuffer.set(o2Bytes, cur); cur += o2Bytes.length;
  fullBuffer.set(o3Bytes, cur); cur += o3Bytes.length;
  fullBuffer.set(o4HBytes, cur); cur += o4HBytes.length;
  fullBuffer.set(jpegBytes, cur); cur += jpegBytes.length;
  fullBuffer.set(o4FBytes, cur); cur += o4FBytes.length;
  fullBuffer.set(o5Bytes, cur); cur += o5Bytes.length;
  fullBuffer.set(xrefBytes, cur); cur += xrefBytes.length;
  fullBuffer.set(trailerBytes, cur); cur += trailerBytes.length;

  return new Blob([fullBuffer], { type: 'application/pdf' });
}

const FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF Document (.pdf)' },
  { value: 'png', label: 'PNG Image (.png)' },
  { value: 'avif', label: 'AVIF Image (.avif)' },
  { value: 'tiff', label: 'TIFF Image (.tiff)' },
  { value: 'webp', label: 'WebP Image (.webp)' },
];

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
  const [selectedFormat, setSelectedFormat] = useState('pdf');

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

  // Unified Multi-Format Exporter
  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);

    try {
      const filename = `Certificate-${certificateCode}.${selectedFormat}`;

      if (selectedFormat === 'pdf') {
        const blob = canvasToPDFBlob(canvas);
        triggerDownload(blob, filename);
      } else if (selectedFormat === 'tiff') {
        const blob = canvasToTIFFBlob(canvas);
        triggerDownload(blob, filename);
      } else if (selectedFormat === 'webp') {
        canvas.toBlob((blob) => {
          if (blob) {
            triggerDownload(blob, filename);
          } else {
            const dataUrl = canvas.toDataURL('image/webp', 0.98);
            triggerDownload(dataUrl, filename);
          }
        }, 'image/webp', 0.98);
      } else if (selectedFormat === 'avif') {
        canvas.toBlob((blob) => {
          if (blob && blob.type === 'image/avif') {
            triggerDownload(blob, filename);
          } else {
            // High-resolution fallback for browsers without native AVIF canvas encoding
            canvas.toBlob((pngBlob) => {
              triggerDownload(pngBlob, filename);
            }, 'image/png');
          }
        }, 'image/avif', 0.95);
      } else {
        // PNG Default
        canvas.toBlob((blob) => {
          if (blob) {
            triggerDownload(blob, filename);
          } else {
            const dataUrl = canvas.toDataURL('image/png', 1.0);
            triggerDownload(dataUrl, filename);
          }
        }, 'image/png', 1.0);
      }
    } catch (err) {
      console.error('Error exporting certificate:', err);
    } finally {
      setTimeout(() => setDownloading(false), 400);
    }
  };

  // Instant Browser Landscape Print
  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    } catch (err) {
      console.error('Failed to open print dialog:', err);
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
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>Real-time Verified Credential • Live Scannable QR</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Format Selection Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-app-muted font-medium select-none">Format:</span>
            <CustomDropdown
              value={selectedFormat}
              onChange={(val) => setSelectedFormat(val)}
              options={FORMAT_OPTIONS}
              size="sm"
              direction="up"
              className="w-48"
              placeholder="Select format"
              aria-label="Select certificate format"
            />
          </div>

          {/* Download Button */}
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleDownload}
            disabled={!rendered || downloading}
            leftIcon={<Download className="h-4 w-4" />}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-sm"
          >
            {downloading ? 'Preparing...' : `Download ${selectedFormat.toUpperCase()}`}
          </Button>

          {/* Print Button */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handlePrint}
            disabled={!rendered || downloading}
            leftIcon={<Printer className="h-4 w-4" />}
          >
            Print
          </Button>
        </div>
      </div>
    </div>
  );
}
