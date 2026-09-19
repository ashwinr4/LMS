import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';
import { io } from '../server.js';
import { scanDocumentSecurity } from '../utils/documentScanner.js';
import { extractRawTextFromBuffer, parseQuestionsFromText } from '../utils/questionExtractor.js';

// Feature Flag: 1-hour cooldown on voluntary exit / failure
// Temporarily set to false per user request for testing. Toggle to true when requested.
export const ENABLE_ONE_HOUR_COOLDOWN = false;

// ═══════════════════════════════════════════════════════════════════
// CREATOR / ADMIN: Question Bank & Assessment Management
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/assessments/extract
 * Upload & extract questions from PDF, DOCX, or text files with 4-stage malware & exploit scan
 */
export async function extractQuestionsFromDocument(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'NO_FILE', message: 'Please upload a PDF or Word document.' });
    }

    // 1. Run 4-stage security & anti-malware verification
    const securityCheck = scanDocumentSecurity(file.buffer, file.originalname);
    if (!securityCheck.safe) {
      logger.warn(`Document upload rejected by security scan: ${file.originalname} - Reason: ${securityCheck.reason}`);
      return res.status(400).json({
        success: false,
        error: 'SECURITY_ALERT',
        message: securityCheck.reason,
      });
    }

    // 2. Extract raw text
    const rawText = await extractRawTextFromBuffer(file.buffer, file.originalname);
    if (!rawText || rawText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'UNREADABLE_DOCUMENT',
        message: 'Could not extract readable text from this document. Ensure it contains text, not purely scanned images.',
      });
    }

    // 3. Parse questions, choices, answers, and explanations
    const parsedQuestions = parseQuestionsFromText(rawText);

    if (parsedQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_QUESTIONS_FOUND',
        message: 'No multiple-choice questions could be detected. Ensure questions are numbered (e.g. 1., Q1:) with options (A, B, C, D).',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully extracted ${parsedQuestions.length} questions from ${file.originalname}.`,
      filename: file.originalname,
      questionCount: parsedQuestions.length,
      questions: parsedQuestions,
    });
  } catch (error) {
    logger.error(`Extract Questions Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'EXTRACTION_FAILED', message: error.message });
  }
}

/**
 * GET /api/v1/assessments?moduleId=xxx
 * List assessments optionally filtered by module
 */
export async function listAssessments(req, res) {
  try {
    const { moduleId } = req.query;
    const where = {};
    if (moduleId) where.moduleId = moduleId;

    const assessments = await prisma.assessment.findMany({
      where,
      include: {
        module: { select: { code: true, title: true, department: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      count: assessments.length,
      assessments: assessments.map((a) => ({
        id: a.id,
        moduleId: a.moduleId,
        moduleCode: a.module?.code,
        moduleTitle: a.module?.title,
        department: a.module?.department,
        title: a.title,
        description: a.description,
        passingScore: a.passingScore,
        sampleSize: a.sampleSize,
        durationMinutes: a.durationMinutes,
        randomizeQuestions: a.randomizeQuestions,
        questionCount: JSON.parse(a.questions || '[]').length,
        submissionCount: a._count.submissions,
        status: a.status,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    logger.error(`List Assessments Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}

/**
 * GET /api/v1/assessments/:id
 * Get full assessment with questions (for creator editing)
 */
export async function getAssessment(req, res) {
  try {
    const { id } = req.params;
    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: {
        module: { select: { code: true, title: true, department: true } },
      },
    });
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assessment not found.' });
    }
    return res.status(200).json({
      success: true,
      assessment: {
        ...assessment,
        questions: JSON.parse(assessment.questions || '[]'),
      },
    });
  } catch (error) {
    logger.error(`Get Assessment Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}

/**
 * POST /api/v1/assessments
 * Create a new assessment
 */
export async function createAssessment(req, res) {
  try {
    const { moduleId, title, description, passingScore, sampleSize, durationMinutes, randomizeQuestions, questions } = req.body;

    if (!moduleId || !title) {
      return res.status(400).json({ success: false, error: 'VALIDATION', message: 'moduleId and title are required.' });
    }

    const module = await prisma.module.findUnique({ where: { id: moduleId } });
    if (!module) {
      return res.status(404).json({ success: false, error: 'MODULE_NOT_FOUND', message: 'Module not found.' });
    }

    const normalizedQuestions = (questions || []).map((q, idx) => ({
      id: q.id || crypto.randomUUID(),
      order: q.order ?? idx,
      text: q.text || '',
      type: q.type || 'MCQ', // MCQ | TRUE_FALSE | MULTI_SELECT
      options: q.options || [],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || '',
      points: q.points || 1,
    }));

    const assessment = await prisma.assessment.create({
      data: {
        moduleId,
        title,
        description: description || '',
        passingScore: passingScore || 70,
        sampleSize: sampleSize || Math.min(normalizedQuestions.length, 10),
        durationMinutes: durationMinutes || 45,
        randomizeQuestions: randomizeQuestions !== false,
        questions: JSON.stringify(normalizedQuestions),
        status: 'PUBLISHED',
      },
    });

    logger.info(`Assessment created: ${assessment.id} for module ${moduleId}`);
    return res.status(201).json({
      success: true,
      message: 'Assessment created successfully.',
      assessment: { ...assessment, questions: normalizedQuestions },
    });
  } catch (error) {
    logger.error(`Create Assessment Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'CREATE_FAILED', message: error.message });
  }
}

/**
 * PUT /api/v1/assessments/:id
 * Update an assessment
 */
export async function updateAssessment(req, res) {
  try {
    const { id } = req.params;
    const { title, description, passingScore, sampleSize, durationMinutes, randomizeQuestions, questions, status } = req.body;

    const existing = await prisma.assessment.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assessment not found.' });
    }

    const normalizedQuestions = questions
      ? (questions || []).map((q, idx) => ({
          id: q.id || crypto.randomUUID(),
          order: q.order ?? idx,
          text: q.text || '',
          type: q.type || 'MCQ',
          options: q.options || [],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          points: q.points || 1,
        }))
      : JSON.parse(existing.questions || '[]');

    const updated = await prisma.assessment.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(passingScore !== undefined && { passingScore }),
        ...(sampleSize !== undefined && { sampleSize }),
        ...(durationMinutes !== undefined && { durationMinutes }),
        ...(randomizeQuestions !== undefined && { randomizeQuestions }),
        ...(status && { status }),
        questions: JSON.stringify(normalizedQuestions),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Assessment updated.',
      assessment: { ...updated, questions: normalizedQuestions },
    });
  } catch (error) {
    logger.error(`Update Assessment Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'UPDATE_FAILED', message: error.message });
  }
}

/**
 * DELETE /api/v1/assessments/:id
 * Delete an assessment
 */
export async function deleteAssessment(req, res) {
  try {
    const { id } = req.params;
    await prisma.assessment.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Assessment deleted.' });
  } catch (error) {
    logger.error(`Delete Assessment Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'DELETE_FAILED', message: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// STUDENT: Exams & Proctored Sessions
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/assessments/my-exams
 * Get exams for student's enrolled courses with unlock status & previous submissions
 */
export async function getMyExams(req, res) {
  try {
    const userId = req.user.id;

    // Get all student assignments
    const assignments = await prisma.assignment.findMany({
      where: { userId },
      select: { moduleId: true, progress: true, status: true },
    });

    const enrolledModuleIds = assignments.map((a) => a.moduleId);
    if (enrolledModuleIds.length === 0) {
      return res.status(200).json({ success: true, exams: [] });
    }

    const assessments = await prisma.assessment.findMany({
      where: { moduleId: { in: enrolledModuleIds }, status: 'PUBLISHED' },
      include: {
        module: { select: { code: true, title: true, department: true } },
        submissions: {
          where: { userId },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    const assignmentMap = {};
    assignments.forEach((a) => { assignmentMap[a.moduleId] = a; });

    // Ensure modules are resolved even when relations are not pre-joined (e.g. MongoDB)
    const modules = await prisma.module.findMany({
      where: { id: { in: enrolledModuleIds } },
      select: { id: true, code: true, title: true, department: true },
    });
    const moduleMap = {};
    modules.forEach((m) => { moduleMap[m.id] = m; });

    // Ensure user submissions are resolved across all databases
    const assessmentIds = assessments.map((a) => a.id);
    const submissions = await prisma.assessmentSubmission.findMany({
      where: { userId, assessmentId: { in: assessmentIds } },
      orderBy: { submittedAt: 'desc' },
    });
    const subMap = {};
    submissions.forEach((s) => {
      if (!subMap[s.assessmentId]) subMap[s.assessmentId] = [];
      subMap[s.assessmentId].push(s);
    });

    // Also check if certificate exists for module
    const certificates = await prisma.certificate.findMany({
      where: { userId },
      select: { moduleId: true, certificateCode: true, verificationHash: true, scoreAchieved: true, issuedAt: true },
    });
    const certMap = {};
    certificates.forEach((c) => { certMap[c.moduleId] = c; });

    return res.status(200).json({
      success: true,
      exams: assessments.map((a) => {
        const assignment = assignmentMap[a.moduleId];
        const mod = a.module || moduleMap[a.moduleId] || {};
        const subs = (Array.isArray(a.submissions) && a.submissions.length > 0)
          ? a.submissions
          : (subMap[a.id] || []);
        const lastSubmission = subs[0] || null;
        const progress = assignment?.progress || 0;
        const cert = certMap[a.moduleId] || null;
        const isUnlocked = progress >= 80;

        let cooldown = null;
        if (lastSubmission && !lastSubmission.passed) {
          let feedbackData = {};
          try {
            feedbackData = JSON.parse(lastSubmission.feedback || '{}');
          } catch (e) {}

          const isDisqualified = feedbackData.disqualified || (feedbackData.violationCount || 0) >= 3;
          if (isDisqualified || ENABLE_ONE_HOUR_COOLDOWN) {
            const cooldownMs = isDisqualified
              ? 7 * 24 * 60 * 60 * 1000 // 7 Days (1 week)
              : 1 * 60 * 60 * 1000;     // 1 Hour

            const submittedTime = new Date(lastSubmission.submittedAt).getTime();
            const expiresAt = new Date(submittedTime + cooldownMs);
            const now = Date.now();

            if (now < expiresAt.getTime()) {
              const msLeft = expiresAt.getTime() - now;
              const daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));
              const hoursLeft = Math.floor((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
              const minutesLeft = Math.ceil((msLeft % (60 * 60 * 1000)) / (60 * 1000));

              cooldown = {
                isDisqualified,
                expiresAt: expiresAt.toISOString(),
                formattedTime: isDisqualified
                  ? `${daysLeft > 0 ? `${daysLeft}d ` : ''}${hoursLeft}h`
                  : `${minutesLeft}m`,
              };
            }
          }
        }

        return {
          id: a.id,
          moduleId: a.moduleId,
          moduleCode: mod.code || a.module?.code || '',
          moduleTitle: mod.title || a.module?.title || '',
          department: mod.department || a.module?.department || '',
          title: a.title,
          description: a.description,
          passingScore: a.passingScore,
          sampleSize: a.sampleSize,
          durationMinutes: a.durationMinutes,
          questionCount: JSON.parse(a.questions || '[]').length,
          isUnlocked,
          courseProgress: progress,
          certificate: cert,
          cooldown,
          lastSubmission: lastSubmission
            ? {
                id: lastSubmission.id,
                score: lastSubmission.score,
                passed: lastSubmission.passed,
                submittedAt: lastSubmission.submittedAt,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    logger.error(`Get My Exams Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}

/**
 * GET /api/v1/assessments/:id/start
 * Launch proctored exam session: enforces cooldowns, draws different questions from prior attempt, and strips answers
 */
export async function startExam(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: { module: { select: { code: true, title: true } } },
    });
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assessment not found.' });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { userId_moduleId: { userId, moduleId: assessment.moduleId } },
    });
    if (!assignment) {
      return res.status(403).json({ success: false, error: 'NOT_ENROLLED', message: 'You are not enrolled in this course.' });
    }

    if (assignment.progress < 80) {
      return res.status(403).json({
        success: false,
        error: 'EXAM_LOCKED',
        message: `Complete at least 80% of the course (current: ${assignment.progress}%) to unlock this proctored exam.`,
      });
    }

    // ── Enforce 1-Hour and 7-Day Cooldowns on Re-attempts ──
    const lastAttempt = await prisma.assessmentSubmission.findFirst({
      where: { assessmentId: assessment.id, userId },
      orderBy: { submittedAt: 'desc' },
    });

    if (lastAttempt && !lastAttempt.passed) {
      let feedbackData = {};
      try {
        feedbackData = JSON.parse(lastAttempt.feedback || '{}');
      } catch (e) {}

      const isDisqualified = feedbackData.disqualified || (feedbackData.violationCount || 0) >= 3;
      if (isDisqualified || ENABLE_ONE_HOUR_COOLDOWN) {
        const cooldownMs = isDisqualified
          ? 7 * 24 * 60 * 60 * 1000 // 7 Days for 3 violations
          : 1 * 60 * 60 * 1000;     // 1 Hour for voluntary exit / standard attempt

        const submittedTime = new Date(lastAttempt.submittedAt).getTime();
        const expiresAt = new Date(submittedTime + cooldownMs);
        const now = Date.now();

        if (now < expiresAt.getTime()) {
          const msLeft = expiresAt.getTime() - now;
          const daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));
          const hoursLeft = Math.floor((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
          const minutesLeft = Math.ceil((msLeft % (60 * 60 * 1000)) / (60 * 1000));

          const timeMsg = isDisqualified
            ? `${daysLeft > 0 ? `${daysLeft} days and ` : ''}${hoursLeft} hours`
            : `${minutesLeft} minutes`;

          return res.status(403).json({
            success: false,
            error: isDisqualified ? 'DISQUALIFIED_COOLDOWN' : 'COOLDOWN_ACTIVE',
            isDisqualified,
            cooldownExpiresAt: expiresAt.toISOString(),
            message: isDisqualified
              ? `You were eliminated for 3 security violations. You cannot retake this exam for 7 days (available in ${timeMsg}).`
              : `You exited this exam recently. You cannot retake it for 1 hour (available in ${timeMsg}).`,
          });
        }
      }
    }

    // ── Question Sampling with Rotation (Different questions on re-entry) ──
    const allQuestions = JSON.parse(assessment.questions || '[]');
    let previousQuestionIds = new Set();
    if (lastAttempt) {
      try {
        const prevAnswers = JSON.parse(lastAttempt.answers || '{}');
        if (prevAnswers && typeof prevAnswers === 'object') {
          if (Array.isArray(prevAnswers.questionIds)) {
            prevAnswers.questionIds.forEach((qid) => previousQuestionIds.add(qid));
          } else {
            Object.keys(prevAnswers).forEach((qid) => previousQuestionIds.add(qid));
          }
        }
      } catch (e) {}
    }

    // Separate unseen vs seen questions from previous attempt
    const unseenQuestions = allQuestions.filter((q) => !previousQuestionIds.has(q.id));
    const seenQuestions = allQuestions.filter((q) => previousQuestionIds.has(q.id));

    // Shuffle both pools
    const shuffledUnseen = [...unseenQuestions].sort(() => Math.random() - 0.5);
    const shuffledSeen = [...seenQuestions].sort(() => Math.random() - 0.5);

    // Prioritize unseen questions first so candidate gets different questions
    let sampled = [...shuffledUnseen, ...shuffledSeen].slice(0, assessment.sampleSize);
    if (assessment.randomizeQuestions) {
      sampled = sampled.sort(() => Math.random() - 0.5);
    }

    // Sanitize: Strip correctAnswer and explanation for student anti-cheat protection
    const sanitizedQuestions = sampled.map((q) => ({
      id: q.id,
      order: q.order,
      text: q.text || q.prompt,
      type: q.type || 'MCQ',
      options: q.options,
      points: q.points || 1,
    }));

    return res.status(200).json({
      success: true,
      session: {
        assessmentId: assessment.id,
        moduleId: assessment.moduleId,
        moduleCode: assessment.module?.code,
        courseTitle: assessment.module?.title,
        title: assessment.title,
        durationMinutes: assessment.durationMinutes,
        passingScore: assessment.passingScore,
        totalPoints: sampled.reduce((s, q) => s + (q.points || 1), 0),
        questionIds: sampled.map((q) => q.id),
        questions: sanitizedQuestions,
        startedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`Start Exam Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'SESSION_FAILED', message: error.message });
  }
}

/**
 * POST /api/v1/assessments/:id/submit
 * Server-side grading, anti-cheat violation auditing, and cryptographic certificate issuance
 */
export async function submitExam(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { answers, questionIds, violations } = req.body;

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: { module: { select: { title: true, code: true } } },
    });
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assessment not found.' });
    }

    const allQuestions = JSON.parse(assessment.questions || '[]');
    const questionMap = {};
    allQuestions.forEach((q) => { questionMap[q.id] = q; });

    let totalPoints = 0;
    let earnedPoints = 0;
    const gradedAnswers = [];

    for (const qId of (questionIds || [])) {
      const question = questionMap[qId];
      if (!question) continue;
      const studentAnswer = answers ? answers[qId] : undefined;
      const points = question.points || 1;
      totalPoints += points;
      const correctAns = question.correctAnswer !== undefined ? question.correctAnswer : question.correctIndex;

      let isCorrect = false;
      const qType = question.type || 'MCQ';
      if (qType === 'MCQ' || qType === 'TRUE_FALSE') {
        isCorrect = Number(studentAnswer) === Number(correctAns);
      } else if (qType === 'MULTI_SELECT') {
        const correct = Array.isArray(correctAns) ? [...correctAns].sort().join(',') : String(correctAns);
        const given = Array.isArray(studentAnswer) ? [...studentAnswer].sort().join(',') : String(studentAnswer);
        isCorrect = correct === given;
      }

      if (isCorrect) earnedPoints += points;
      gradedAnswers.push({
        questionId: qId,
        questionText: question.text || question.prompt,
        studentAnswer,
        correctAnswer: correctAns,
        isCorrect,
        explanation: question.explanation,
        points,
        earnedPoints: isCorrect ? points : 0,
      });
    }

    const isDisqualified = req.body.disqualified === true || (violations && violations.length >= 3);
    const score = isDisqualified ? 0 : (totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0);
    const passed = isDisqualified ? false : (score >= assessment.passingScore);
    const violationList = violations || [];
    const violationCount = violationList.length;

    const feedback = JSON.stringify({
      score,
      passed,
      earnedPoints,
      totalPoints,
      violationCount,
      violations: violationList,
      disqualified: isDisqualified,
      reason: isDisqualified ? 'VIOLATION_LIMIT_EXCEEDED' : null,
      gradedAnswers,
    });

    const submission = await prisma.assessmentSubmission.create({
      data: {
        assessmentId: id,
        userId,
        answers: JSON.stringify(answers || {}),
        score,
        passed,
        feedback,
      },
    });

    // Generate cryptographic certificate if passed
    let certificate = null;
    if (passed) {
      const existingCert = await prisma.certificate.findFirst({
        where: { userId, moduleId: assessment.moduleId },
      });

      if (!existingCert) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        const year = new Date().getFullYear();
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        const certCode = `ESMMS-CERT-${year}-${randomHex}`;

        const hashPayload = `${certCode}|${userId}|${assessment.moduleId}|${score}|${new Date().toISOString()}`;
        const verificationHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

        certificate = await prisma.certificate.create({
          data: {
            certificateCode: certCode,
            userId,
            moduleId: assessment.moduleId,
            studentName: user?.name || 'Enterprise Student',
            courseTitle: assessment.module?.title || 'Course Certificate',
            scoreAchieved: score,
            status: 'VERIFIED',
            verificationHash,
          },
        });

        // Mark Assignment as COMPLETED with 100% progress
        await prisma.assignment.update({
          where: { userId_moduleId: { userId, moduleId: assessment.moduleId } },
          data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
        });

        // Create In-App Notification for Student
        try {
          await prisma.notification.create({
            data: {
              recipientId: userId,
              title: '🎓 Certificate Issued!',
              message: `Congratulations! You completed ${assessment.module?.title} and earned your verified certificate (${certCode}).`,
              type: 'CERTIFICATE',
              link: `/verify?id=${certCode}`,
              metadata: JSON.stringify({ certificateCode: certCode }),
            },
          });
          if (io) {
            io.to(`user_${userId}`).emit('system_notification', {
              title: '🎓 Certificate Issued!',
              message: `Congratulations! Your certificate for ${assessment.module?.title} is ready.`,
              type: 'CERTIFICATE',
              link: `/verify?id=${certCode}`,
            });
          }
        } catch (notifErr) {
          logger.warn(`Failed to create certificate notification: ${notifErr.message}`);
        }

        logger.info(`Certificate issued: ${certCode} for user ${userId}`);
      } else {
        certificate = existingCert;
      }
    }

    // Log security audit entry for disqualification or high violation count
    if (isDisqualified || violationCount >= 3) {
      await prisma.auditLog.create({
        data: {
          actorId: userId,
          actorEmail: req.user.email,
          actorName: req.user.name,
          action: 'EXAM_DISQUALIFIED',
          resource: `Assessment: ${assessment.title}`,
          details: `Candidate eliminated after 3 security violations. 7-day retake ban applied.`,
          ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
          riskLevel: 'HIGH',
        },
      });

      // Emit Security Alert to Admins
      try {
        await prisma.notification.create({
          data: {
            targetRole: 'ADMIN',
            title: '🚨 Candidate Disqualified',
            message: `${req.user.name} eliminated from ${assessment.title} after 3 security violations. 7-day retake lockout applied.`,
            type: 'SECURITY_ALERT',
            link: '/admin/audit',
          },
        });
        if (io) {
          io.to('role_ADMIN').emit('system_notification', {
            title: '🚨 Candidate Disqualified',
            message: `${req.user.name} eliminated from ${assessment.title} (3 violations).`,
            type: 'SECURITY_ALERT',
            link: '/admin/audit',
          });
        }
      } catch (alertErr) {
        logger.warn(`Failed to create anti-cheat alert: ${alertErr.message}`);
      }
    }

    logger.info(`Exam submitted: assessment=${id} user=${userId} score=${score}% passed=${passed} violations=${violationCount} disqualified=${isDisqualified}`);

    return res.status(200).json({
      success: true,
      isDisqualified,
      message: isDisqualified
        ? 'Exam terminated due to 3 security violations. You cannot retake this exam for 7 days.'
        : passed
        ? 'Assessment Passed! Cryptographic Certificate Generated.'
        : 'Assessment Completed. Passing score was not met.',
      result: {
        submissionId: submission.id,
        score,
        passed,
        passingScore: assessment.passingScore,
        earnedPoints,
        totalPoints,
        violationCount,
        disqualified: isDisqualified,
        gradedAnswers,
      },
      certificate: certificate
        ? {
            id: certificate.id,
            code: certificate.certificateCode,
            verificationHash: certificate.verificationHash,
            scoreAchieved: certificate.scoreAchieved,
            studentName: certificate.studentName,
            courseTitle: certificate.courseTitle,
            issuedAt: certificate.issuedAt,
          }
        : null,
    });
  } catch (error) {
    logger.error(`Submit Exam Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'SUBMIT_FAILED', message: error.message });
  }
}

/**
 * POST /api/v1/assessments/:id/exit
 * Candidate voluntarily exits the exam (applies 1-hour retake cooldown)
 */
export async function exitExam(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { questionIds, answers } = req.body || {};

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: { module: { select: { title: true, code: true } } },
    });
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assessment not found.' });
    }

    const feedback = JSON.stringify({
      abandoned: true,
      reason: 'EXAM_ABANDONED',
      score: 0,
      passed: false,
      message: 'Candidate voluntarily exited the exam session.',
    });

    const storedAnswers = JSON.stringify({
      ...(answers || {}),
      questionIds: questionIds || [],
    });

    await prisma.assessmentSubmission.create({
      data: {
        assessmentId: id,
        userId,
        answers: storedAnswers,
        score: 0,
        passed: false,
        feedback,
      },
    });

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        actorEmail: req.user.email,
        actorName: req.user.name,
        action: 'EXAM_ABANDONED',
        resource: `Assessment: ${assessment.title}`,
        details: 'Candidate voluntarily exited the exam session. 1-hour retake cooldown applied.',
        ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
        riskLevel: 'LOW',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'You have exited the exam. A 1-hour cooldown has been applied.',
      cooldownExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    logger.error(`Exit Exam Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'EXIT_FAILED', message: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// CERTIFICATES
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/certificates/my-certificates
 * Student: Get all issued cryptographic certificates
 */
export async function getMyCertificates(req, res) {
  try {
    const userId = req.user.id;
    const certs = await prisma.certificate.findMany({
      where: { userId },
      include: {
        module: { select: { code: true, title: true, department: true, duration: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      count: certs.length,
      certificates: certs.map((c) => ({
        id: c.id,
        code: c.certificateCode,
        studentName: c.studentName,
        courseCode: c.module?.code,
        courseTitle: c.courseTitle,
        department: c.module?.department,
        duration: c.module?.duration,
        scoreAchieved: c.scoreAchieved,
        status: c.status,
        verificationHash: c.verificationHash,
        issuedAt: c.issuedAt,
      })),
    });
  } catch (error) {
    logger.error(`Get My Certificates Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}
