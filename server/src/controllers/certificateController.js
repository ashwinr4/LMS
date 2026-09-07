import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

export async function verifyCertificate(req, res) {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'CERTIFICATE_CODE_REQUIRED',
        message: 'Certificate code is required.',
      });
    }

    const certificate = await prisma.certificate.findFirst({
      where: {
        certificateCode: code.toUpperCase().trim(),
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
        message: `No certificate record found for code ${code}. Please verify the code and try again.`,
      });
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
        department: certificate.module?.department || certificate.user?.department || 'General',
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
