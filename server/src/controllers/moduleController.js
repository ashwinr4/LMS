import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';
import { io } from '../server.js';

// ============================================================
// LIST MODULES (public, all)
// ============================================================
export async function listModules(req, res) {
  try {
    const { department, status = 'ACTIVE', type, search } = req.query;
    const cacheKey = `modules:list:${department || ''}:${status || ''}:${type || ''}:${search || ''}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

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

    const payload = {
      success: true,
      modules: modules.map((m) => ({
        ...m,
        outcomes: m.outcomes ? (typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes) : [],
        prerequisites: m.prerequisites ? (typeof m.prerequisites === 'string' ? JSON.parse(m.prerequisites) : m.prerequisites) : [],
        sectionCount: m._count?.sections ?? (Array.isArray(m.sections) ? m.sections.length : 0),
        enrolledCount: m._count?.assignments ?? (Array.isArray(m.assignments) ? m.assignments.length : 0),
      })),
    };

    cache.set(cacheKey, payload, 30);
    return res.status(200).json(payload);
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
    const cacheKey = `modules:detail:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

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

    const payload = {
      success: true,
      module: {
        ...module,
        outcomes: module.outcomes ? JSON.parse(module.outcomes) : [],
        prerequisites: module.prerequisites ? JSON.parse(module.prerequisites) : [],
        enrolledCount: module._count.assignments,
      },
    };

    cache.set(cacheKey, payload, 30);
    return res.status(200).json(payload);
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
    cache.invalidatePrefix('modules:');
    cache.invalidatePrefix('admin:');

    if (io) {
      io.to('role_ADMIN').to('role_MODERATOR').to('role_COURSE_CREATOR').emit('course_created', { module });
    }

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

    const existing = await prisma.module.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Module not found.' });
    }

    if (req.user && req.user.role === 'COURSE_CREATOR') {
      const isOwner = existing.createdBy === req.user.id || existing.instructorId === req.user.id;
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_OWNERSHIP',
          message: 'You are only authorized to modify your own courses.',
        });
      }
    }

    const module = await prisma.module.update({
      where: { id },
      data: {
        ...rest,
        outcomes: outcomes ? JSON.stringify(outcomes) : undefined,
        prerequisites: prerequisites ? JSON.stringify(prerequisites) : undefined,
      },
    });

    cache.invalidatePrefix('modules:');
    cache.invalidatePrefix('admin:');

    if (io) {
      io.to('role_ADMIN').to('role_MODERATOR').to('role_COURSE_CREATOR').to(`course_${id}`).emit('course_updated', { moduleId: id, module });
      io.to(`course_${id}`).emit('curriculum_updated', { moduleId: id });
    }

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

    const existing = await prisma.module.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Module not found.' });
    }

    if (req.user && req.user.role === 'COURSE_CREATOR') {
      const isOwner = existing.createdBy === req.user.id || existing.instructorId === req.user.id;
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_OWNERSHIP',
          message: 'You are only authorized to delete your own courses.',
        });
      }
    }

    await prisma.module.delete({ where: { id } });
    cache.invalidatePrefix('modules:');
    cache.invalidatePrefix('admin:');

    if (io) {
      io.to('role_ADMIN').to('role_MODERATOR').to('role_COURSE_CREATOR').to(`course_${id}`).emit('course_deleted', { moduleId: id });
    }

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

    const parentModule = await prisma.module.findUnique({ where: { id: moduleId } });
    if (!parentModule) {
      return res.status(404).json({ success: false, message: 'Course module not found.' });
    }

    if (req.user && req.user.role === 'COURSE_CREATOR') {
      const isOwner = parentModule.createdBy === req.user.id || parentModule.instructorId === req.user.id;
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_OWNERSHIP',
          message: 'You are only authorized to add sections to your own courses.',
        });
      }
    }

    const count = await prisma.section.count({ where: { moduleId } });
    const section = await prisma.section.create({
      data: { moduleId, title, order: count },
    });

    cache.invalidatePrefix('modules:');

    if (io) {
      io.to(`course_${moduleId}`).emit('curriculum_updated', { moduleId });
    }

    return res.status(201).json({ success: true, section });
  } catch (error) {
    logger.error(`Create Section Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to create section.' });
  }
}

export async function updateSection(req, res) {
  try {
    const { sectionId } = req.params;

    const existingSection = await prisma.section.findUnique({
      where: { id: sectionId },
      include: { module: { select: { createdBy: true, instructorId: true } } },
    });
    if (!existingSection) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    if (req.user && req.user.role === 'COURSE_CREATOR') {
      const isOwner =
        existingSection.module?.createdBy === req.user.id ||
        existingSection.module?.instructorId === req.user.id;
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_OWNERSHIP',
          message: 'You are only authorized to modify sections in your own courses.',
        });
      }
    }

    const section = await prisma.section.update({
      where: { id: sectionId },
      data: req.body,
    });
    cache.invalidatePrefix('modules:');

    if (io && section?.moduleId) {
      io.to(`course_${section.moduleId}`).emit('curriculum_updated', { moduleId: section.moduleId });
    }

    return res.status(200).json({ success: true, section });
  } catch (error) {
    logger.error(`Update Section Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to update section.' });
  }
}

export async function deleteSection(req, res) {
  try {
    const { sectionId } = req.params;
    const existingSection = await prisma.section.findUnique({
      where: { id: sectionId },
      include: { module: { select: { createdBy: true, instructorId: true } } },
    });

    if (!existingSection) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    if (req.user && req.user.role === 'COURSE_CREATOR') {
      const isOwner =
        existingSection.module?.createdBy === req.user.id ||
        existingSection.module?.instructorId === req.user.id;
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_OWNERSHIP',
          message: 'You are only authorized to delete sections in your own courses.',
        });
      }
    }

    await prisma.section.delete({ where: { id: sectionId } });
    cache.invalidatePrefix('modules:');

    if (io && existingSection?.moduleId) {
      io.to(`course_${existingSection.moduleId}`).emit('curriculum_updated', { moduleId: existingSection.moduleId });
    }

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

    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      include: { module: { select: { createdBy: true, instructorId: true } } },
    });

    if (!section) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    if (req.user && req.user.role === 'COURSE_CREATOR') {
      const isOwner =
        section.module?.createdBy === req.user.id ||
        section.module?.instructorId === req.user.id;
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_OWNERSHIP',
          message: 'You are only authorized to add lessons to your own courses.',
        });
      }
    }

    const count = await prisma.lesson.count({ where: { sectionId } });
    const lesson = await prisma.lesson.create({
      data: { sectionId, title, type, videoUrl, content, documentName, duration, notes, order: count },
    });

    cache.invalidatePrefix('modules:');

    if (io && section?.moduleId) {
      io.to(`course_${section.moduleId}`).emit('curriculum_updated', { moduleId: section.moduleId });
    }

    return res.status(201).json({ success: true, lesson });
  } catch (error) {
    logger.error(`Create Lesson Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to create lesson.' });
  }
}

export async function updateLesson(req, res) {
  try {
    const { lessonId } = req.params;

    const existingLesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        section: {
          include: { module: { select: { createdBy: true, instructorId: true } } },
        },
      },
    });

    if (!existingLesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found.' });
    }

    if (req.user && req.user.role === 'COURSE_CREATOR') {
      const isOwner =
        existingLesson.section?.module?.createdBy === req.user.id ||
        existingLesson.section?.module?.instructorId === req.user.id;
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_OWNERSHIP',
          message: 'You are only authorized to modify lessons in your own courses.',
        });
      }
    }

    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: req.body,
    });
    const section = await prisma.section.findUnique({ where: { id: lesson.sectionId }, select: { moduleId: true } });
    cache.invalidatePrefix('modules:');

    if (io && section?.moduleId) {
      io.to(`course_${section.moduleId}`).emit('curriculum_updated', { moduleId: section.moduleId });
    }

    return res.status(200).json({ success: true, lesson });
  } catch (error) {
    logger.error(`Update Lesson Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to update lesson.' });
  }
}

export async function deleteLesson(req, res) {
  try {
    const { lessonId } = req.params;
    const existingLesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        section: {
          include: { module: { select: { createdBy: true, instructorId: true } } },
        },
      },
    });

    if (!existingLesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found.' });
    }

    if (req.user && req.user.role === 'COURSE_CREATOR') {
      const isOwner =
        existingLesson.section?.module?.createdBy === req.user.id ||
        existingLesson.section?.module?.instructorId === req.user.id;
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_OWNERSHIP',
          message: 'You are only authorized to delete lessons in your own courses.',
        });
      }
    }

    await prisma.lesson.delete({ where: { id: lessonId } });
    cache.invalidatePrefix('modules:');

    if (io && existingLesson?.section?.moduleId) {
      io.to(`course_${existingLesson.section.moduleId}`).emit('curriculum_updated', { moduleId: existingLesson.section.moduleId });
    }

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

    const parsedSectionIdx = Number(sectionIdx) || 0;
    const parsedLessonIdx = Number(lessonIdx) || 0;
    const lessonKey = `${parsedSectionIdx}_${parsedLessonIdx}`;

    // Total lessons calculation
    const totalLessons = (assignment.module?.sections || []).reduce(
      (sum, sec) => sum + (sec.lessons?.length || 0), 0
    ) || 1;

    let progress = assignment.progress || 0;
    let isCompleted = progress >= 100;

    const updatedData = {
      lastActive: JSON.stringify({
        sectionIdx: parsedSectionIdx,
        lessonIdx: parsedLessonIdx,
        lessonId: lessonId || null,
        timestamp: Number(timestamp) || 0,
      }),
    };

    // Only mark complete if explicitly requested (not just position save or heartbeat)
    if (markAsFinished) {
      // Enforce strict sequential unlocking on backend
      const allLessons = (assignment.module?.sections || []).flatMap((sec, sI) =>
        (sec.lessons || []).map((les, lI) => ({ id: les.id, key: `${sI}_${lI}` }))
      );
      const currentFlatIdx = allLessons.findIndex(
        (l) => l.key === lessonKey || (lessonId && l.id === lessonId)
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

      progress = Math.min(100, Math.round((completedLessons.length / totalLessons) * 100));
      isCompleted = progress >= 100;

      updatedData.completedLessons = JSON.stringify(completedLessons);
      updatedData.progress = progress;
      if (isCompleted) {
        updatedData.status = 'UNDER_REVIEW';
        if (!assignment.completedAt) {
          updatedData.completedAt = new Date();
        }
      } else if (!assignment.status || assignment.status === 'NOT_STARTED') {
        updatedData.status = 'IN_PROGRESS';
      }
    }

    const updated = await prisma.assignment.update({
      where: { userId_moduleId: { userId, moduleId } },
      data: updatedData,
    });

    return res.status(200).json({
      success: true,
      progress: markAsFinished ? progress : assignment.progress,
      completedLessons: markAsFinished ? completedLessons : (assignment.completedLessons ? JSON.parse(assignment.completedLessons) : []),
      isCompleted: markAsFinished ? isCompleted : ((assignment.progress || 0) >= 100),
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

    let lastActive = null;
    if (assignment.lastActive) {
      try {
        lastActive = typeof assignment.lastActive === 'string'
          ? JSON.parse(assignment.lastActive)
          : assignment.lastActive;
      } catch (e) {
        lastActive = null;
      }
    }

    return res.status(200).json({
      success: true,
      enrolled: true,
      progress: assignment.progress,
      status: assignment.status,
      dueDate: assignment.dueDate,
      completedLessons: assignment.completedLessons ? JSON.parse(assignment.completedLessons) : [],
      lastActive,
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
        const totalLessons = (a.module?.sections || []).reduce((sum, sec) => sum + (sec.lessons?.length || 0), 0);
        const completedLessons = a.completedLessons ? JSON.parse(a.completedLessons) : [];
        let lastActive = null;
        if (a.lastActive) {
          try {
            lastActive = typeof a.lastActive === 'string'
              ? JSON.parse(a.lastActive)
              : a.lastActive;
          } catch (e) {
            lastActive = null;
          }
        }
        return {
          id: a.id,
          moduleId: a.moduleId,
          code: a.module?.code,
          title: a.module?.title,
          progress: a.progress,
          status: a.status,
          dueDate: a.dueDate,
          completedLessonsCount: completedLessons.length,
          totalLessons,
          lastActive,
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

