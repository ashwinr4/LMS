import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

export async function verifyCertificate(req, res) {
  try {
    const rawCode = req.params.code || req.query.code || req.query.id;

    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return res.status(400).json({
        success: false,
        error: 'CERTIFICATE_CODE_REQUIRED',
        message: 'Certificate code is required.',
      });
    }

    // Cleanse input: if candidate or verifier pastes a full URL, extract the code
    let cleanCode = rawCode.trim();
    if (cleanCode.includes('http://') || cleanCode.includes('https://') || cleanCode.includes('?')) {
      const match = cleanCode.match(/[?&](?:code|id)=([^&]+)/i);
      if (match && match[1]) {
        cleanCode = decodeURIComponent(match[1]).trim();
      } else {
        const segments = cleanCode.split('/').filter(Boolean);
        if (segments.length > 0 && segments[segments.length - 1] !== 'verify') {
          cleanCode = segments[segments.length - 1].split('?')[0].trim();
        }
      }
    }

    // Lookup by Certificate Code, Verification Hash, or Database ID
    const certificate = await prisma.certificate.findFirst({
      where: {
        OR: [
          { certificateCode: cleanCode.toUpperCase() },
          { certificateCode: cleanCode },
          { verificationHash: cleanCode.toLowerCase() },
          { verificationHash: cleanCode },
          { id: cleanCode },
        ],
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            department: true,
          },
        },
        module: {
          select: {
            title: true,
            code: true,
            department: true,
            duration: true,
          },
        },
      },
    });

    if (!certificate) {
      return res.status(404).json({
        success: false,
        error: 'CERTIFICATE_NOT_FOUND',
        message: `No certificate record found for code "${cleanCode}". Please verify the code and try again.`,
      });
    }

    // Ensure department resolution
    let department = certificate.module?.department || certificate.user?.department;
    if (!department && certificate.moduleId) {
      try {
        const mod = await prisma.module.findUnique({
          where: { id: certificate.moduleId },
          select: { department: true },
        });
        if (mod?.department) department = mod.department;
      } catch (e) {}
    }

    return res.status(200).json({
      success: true,
      message: 'Certificate verified authentic.',
      certificate: {
        id: certificate.id,
        code: certificate.certificateCode,
        studentName: certificate.studentName,
        courseTitle: certificate.courseTitle,
        scoreAchieved: certificate.scoreAchieved,
        status: certificate.status,
        verificationHash: certificate.verificationHash,
        issuedAt: certificate.issuedAt,
        department: department || 'Enterprise Training',
      },
    });
  } catch (error) {
    logger.error(`Certificate Verification Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'VERIFICATION_FAILED',
      message: 'An error occurred while verifying the certificate.',
    });
  }
}
