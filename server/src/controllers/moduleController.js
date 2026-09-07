import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

// ============================================================
// LIST MODULES (public, all)
// ============================================================
export async function listModules(req, res) {
  try {
    const { department, status = 'ACTIVE', type, search } = req.query;

    const where = { status };
    if (department) where.department = department;
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { code: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const modules = await prisma.module.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        department: true,
        level: true,
        duration: true,
        instructorName: true,
        type: true,
        status: true,
        rating: true,
        ratingCount: true,
        outcomes: true,
        prerequisites: true,
        expiresMonths: true,
        expiresAt: true,
        createdAt: true,
        _count: { select: { sections: true, assignments: true } },
      },
    });

    return res.status(200).json({
      success: true,
      modules: modules.map((m) => ({
        ...m,
        outcomes: m.outcomes ? JSON.parse(m.outcomes) : [],
        prerequisites: m.prerequisites ? JSON.parse(m.prerequisites) : [],
        sectionCount: m._count.sections,
        enrolledCount: m._count.assignments,
      })),
    });
  } catch (error) {
    logger.error(`List Modules Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch modules.' });
  }
}

// ============================================================
// GET ONE MODULE WITH FULL CURRICULUM
// ============================================================
export async function getModule(req, res) {
  try {
    const { id } = req.params;

    const module = await prisma.module.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
            },
          },
        },
        assessments: {
          select: {
            id: true,
            title: true,
            description: true,
            passingScore: true,
            sampleSize: true,
            durationMinutes: true,
            randomizeQuestions: true,
            questions: true,
            status: true,
          },
        },
        _count: { select: { assignments: true } },
      },
    });

    if (!module) {
      return res.status(404).json({ success: false, message: 'Module not found.' });
    }

    return res.status(200).json({
      success: true,
      module: {
        ...module,
        outcomes: module.outcomes ? JSON.parse(module.outcomes) : [],
        prerequisites: module.prerequisites ? JSON.parse(module.prerequisites) : [],
        enrolledCount: module._count.assignments,
      },
    });
  } catch (error) {
    logger.error(`Get Module Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch module.' });
  }
}

// ============================================================
// CREATE MODULE (COURSE_CREATOR | ADMIN)
// ============================================================
export async function createModule(req, res) {
  try {
    const {
      code, title, description, department, level,
      duration, type, outcomes, prerequisites, expiresMonths,
    } = req.body;

    if (!code || !title || !department) {
      return res.status(400).json({
        success: false,
        message: 'Code, title, and department are required.',
      });
    }

    const existing = await prisma.module.findUnique({ where: { code } });
    if (existing) {
      return res.status(409).json({ success: false, message: `Module code ${code} already exists.` });
    }

    const months = expiresMonths || 12;
    const module = await prisma.module.create({
      data: {
        code: code.toUpperCase().trim(),
        title,
        description,
        department,
        level: level || 'Beginner',
        duration,
        instructorName: req.user.name,
        instructorId: req.user.id,
        type: type || 'ACADEMY_COURSE',
        status: 'DRAFT',
        outcomes: outcomes ? JSON.stringify(outcomes) : null,
        prerequisites: prerequisites ? JSON.stringify(prerequisites) : null,
        expiresMonths: months,
        expiresAt: new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000),
        createdBy: req.user.id,
      },
    });

    logger.info(`Module created: ${module.code} by ${req.user.email}`);
    return res.status(201).json({ success: true, module });
  } catch (error) {
    logger.error(`Create Module Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to create module.' });
  }
}

// ============================================================
// UPDATE MODULE
// ============================================================
export async function updateModule(req, res) {
  try {
    const { id } = req.params;
    const { outcomes, prerequisites, ...rest } = req.body;

    const module = await prisma.module.update({
      where: { id },
      data: {
        ...rest,
        outcomes: outcomes ? JSON.stringify(outcomes) : undefined,
        prerequisites: prerequisites ? JSON.stringify(prerequisites) : undefined,
      },
    });

    return res.status(200).json({ success: true, module });
  } catch (error) {
    logger.error(`Update Module Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to update module.' });
  }
}

// ============================================================
// DELETE MODULE
// ============================================================
export async function deleteModule(req, res) {
  try {
    const { id } = req.params;
    await prisma.module.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Module deleted successfully.' });
  } catch (error) {
    logger.error(`Delete Module Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to delete module.' });
  }
}

// ============================================================
// SECTION CRUD
// ============================================================
export async function createSection(req, res) {
  try {
    const { id: moduleId } = req.params;
    const { title } = req.body;

    if (!title) return res.status(400).json({ success: false, message: 'Section title is required.' });

    const count = await prisma.section.count({ where: { moduleId } });
    const section = await prisma.section.create({
      data: { moduleId, title, order: count },
    });

    return res.status(201).json({ success: true, section });
  } catch (error) {
    logger.error(`Create Section Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to create section.' });
  }
}

export async function updateSection(req, res) {
  try {
    const { sectionId } = req.params;
    const section = await prisma.section.update({
      where: { id: sectionId },
      data: req.body,
    });
    return res.status(200).json({ success: true, section });
  } catch (error) {
    logger.error(`Update Section Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to update section.' });
  }
}

export async function deleteSection(req, res) {
  try {
    const { sectionId } = req.params;
    await prisma.section.delete({ where: { id: sectionId } });
    return res.status(200).json({ success: true, message: 'Section deleted.' });
  } catch (error) {
    logger.error(`Delete Section Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to delete section.' });
  }
}

// ============================================================
// LESSON CRUD
// ============================================================
export async function createLesson(req, res) {
  try {
    const { sectionId } = req.params;
    const { title, type, videoUrl, content, documentName, duration, notes } = req.body;

    if (!title || !type) return res.status(400).json({ success: false, message: 'Title and type required.' });

    const count = await prisma.lesson.count({ where: { sectionId } });
    const lesson = await prisma.lesson.create({
      data: { sectionId, title, type, videoUrl, content, documentName, duration, notes, order: count },
    });

    return res.status(201).json({ success: true, lesson });
  } catch (error) {
    logger.error(`Create Lesson Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to create lesson.' });
  }
}

export async function updateLesson(req, res) {
  try {
    const { lessonId } = req.params;
    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: req.body,
    });
    return res.status(200).json({ success: true, lesson });
  } catch (error) {
    logger.error(`Update Lesson Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to update lesson.' });
  }
}

export async function deleteLesson(req, res) {
  try {
    const { lessonId } = req.params;
    await prisma.lesson.delete({ where: { id: lessonId } });
    return res.status(200).json({ success: true, message: 'Lesson deleted.' });
  } catch (error) {
    logger.error(`Delete Lesson Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to delete lesson.' });
  }
}

// ============================================================
// LESSON PROGRESS (Student marks lesson complete or saves timestamp)
// ============================================================
export async function completeLesson(req, res) {
  try {
    const { lessonId } = req.params;
    const { moduleId, sectionIdx, lessonIdx, timestamp, markAsFinished } = req.body;
    const userId = req.user.id;

    // Find the assignment
    const assignment = await prisma.assignment.findUnique({
      where: { userId_moduleId: { userId, moduleId } },
      include: {
        module: {
          include: {
            sections: {
              include: { lessons: { orderBy: { order: 'asc' } } },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'No active assignment found for this module.' });
    }

    // Existing completed lessons set
    let completedLessons = assignment.completedLessons
      ? JSON.parse(assignment.completedLessons)
      : [];

    const lessonKey = `${sectionIdx}_${lessonIdx}`;

    // Only mark complete if explicitly requested (not just periodic timestamp save)
    if (markAsFinished) {
      // Enforce strict sequential unlocking on backend
      const allLessons = assignment.module.sections.flatMap((sec, sI) =>
        sec.lessons.map((les, lI) => ({ id: les.id, key: `${sI}_${lI}` }))
      );
      const currentFlatIdx = allLessons.findIndex(
        (l) => l.key === lessonKey || l.id === lessonId
      );

      if (currentFlatIdx > 0) {
        const prevLesson = allLessons[currentFlatIdx - 1];
        if (!completedLessons.includes(prevLesson.key)) {
          return res.status(403).json({
            success: false,
            error: 'PREVIOUS_LESSON_INCOMPLETE',
            message: 'You must complete the previous lecture before completing this one.',
          });
        }
      }

      if (!completedLessons.includes(lessonKey)) {
        completedLessons.push(lessonKey);
      }
    }

    // Calculate total lessons
    const totalLessons = assignment.module.sections.reduce(
      (sum, sec) => sum + sec.lessons.length, 0
    ) || 1;
    const progress = Math.round((completedLessons.length / totalLessons) * 100);
    const isCompleted = progress >= 100;

    const updated = await prisma.assignment.update({
      where: { userId_moduleId: { userId, moduleId } },
      data: {
        completedLessons: JSON.stringify(completedLessons),
        progress,
        status: isCompleted ? 'UNDER_REVIEW' : assignment.status || 'IN_PROGRESS',
        completedAt: isCompleted ? new Date() : undefined,
        lastActive: JSON.stringify({ sectionIdx, lessonIdx, lessonId, timestamp: timestamp || 0 }),
      },
    });

    return res.status(200).json({
      success: true,
      progress,
      completedLessons,
      isCompleted,
      assignment: updated,
    });
  } catch (error) {
    logger.error(`Complete Lesson Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to update lesson progress.' });
  }
}

// ============================================================
// GET STUDENT PROGRESS FOR A MODULE
// ============================================================
export async function getModuleProgress(req, res) {
  try {
    const { id: moduleId } = req.params;
    const userId = req.user.id;

    const assignment = await prisma.assignment.findUnique({
      where: { userId_moduleId: { userId, moduleId } },
    });

    if (!assignment) {
      return res.status(200).json({ success: true, enrolled: false, progress: 0, completedLessons: [] });
    }

    return res.status(200).json({
      success: true,
      enrolled: true,
      progress: assignment.progress,
      status: assignment.status,
      dueDate: assignment.dueDate,
      completedLessons: assignment.completedLessons ? JSON.parse(assignment.completedLessons) : [],
      lastActive: assignment.lastActive ? JSON.parse(assignment.lastActive) : null,
    });
  } catch (error) {
    logger.error(`Get Progress Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch progress.' });
  }
}

// ============================================================
// GET MY ASSIGNMENTS (STUDENT ENROLLED COURSES)
// ============================================================
export async function getMyAssignments(req, res) {
  try {
    const userId = req.user.id;
    const assignments = await prisma.assignment.findMany({
      where: { userId },
      include: {
        module: {
          include: {
            sections: {
              include: { lessons: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      assignments: assignments.map((a) => {
        const totalLessons = a.module.sections.reduce((sum, sec) => sum + sec.lessons.length, 0);
        const completedLessons = a.completedLessons ? JSON.parse(a.completedLessons) : [];
        return {
          id: a.id,
          moduleId: a.moduleId,
          code: a.module.code,
          title: a.module.title,
          progress: a.progress,
          status: a.status,
          dueDate: a.dueDate,
          completedLessonsCount: completedLessons.length,
          totalLessons,
          lastActive: a.lastActive ? JSON.parse(a.lastActive) : null,
        };
      }),
    });
  } catch (error) {
    logger.error(`Get My Assignments Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch enrolled courses.' });
  }
}

// ============================================================
// UPLOAD LESSON MEDIA (VIDEOS, DOCUMENTS, PDFS, IMAGES)
// ============================================================
export async function uploadLessonMedia(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file received for lecture upload.' });
    }
    const relativeUrl = `/uploads/lessons/${req.file.filename}`;
    logger.info(`Lecture file uploaded successfully: ${req.file.originalname} -> ${relativeUrl} (${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`);
    return res.status(200).json({
      success: true,
      fileUrl: relativeUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    logger.error(`Upload Lesson Media Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to upload lecture file.' });
  }
}

