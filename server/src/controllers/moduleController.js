import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';
import { io } from '../server.js';
import { resolveMediaUrl } from '../utils/storage.js';

// ============================================================
// LIST MODULES (public, all)
// ============================================================
export async function listModules(req, res) {
  try {
    const { department, status = 'ACTIVE', type, search } = req.query;

    // Enforce publication visibility:
    // Only ADMIN, MODERATOR, or COURSE_CREATOR can query non-ACTIVE courses.
    // Anonymous visitors and standard students are strictly restricted to ACTIVE courses.
    let targetStatus = 'ACTIVE';
    const isPrivileged = req.user && (req.user.role === 'ADMIN' || req.user.role === 'MODERATOR');
    const isCreator = req.user && req.user.role === 'COURSE_CREATOR';

    if (status && status !== 'ACTIVE') {
      if (isPrivileged || isCreator) {
        targetStatus = status;
      } else {
        targetStatus = 'ACTIVE';
      }
    }

    const callerScope = isPrivileged ? `priv:${req.user.id}` : (isCreator ? `creator:${req.user.id}` : 'public');
    const cacheKey = `modules:list:${callerScope}:${department || ''}:${targetStatus || ''}:${type || ''}:${search || ''}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const where = { status: targetStatus };

    // If creator queries non-active courses (e.g. DRAFT), scope strictly to their own courses
    if (isCreator && targetStatus !== 'ACTIVE') {
      where.OR = [
        { createdBy: req.user.id },
        { instructorId: req.user.id },
      ];
    }

    if (department) where.department = department;
    if (type) where.type = type;
    if (search) {
      const searchConditions = [
        { title: { contains: search } },
        { code: { contains: search } },
        { description: { contains: search } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
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
    const callerScope = req.user ? `${req.user.id}:${req.user.role}` : 'anon';
    const cacheKey = `modules:detail:${id}:${callerScope}`;
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

    // Publication integrity: Non-active (DRAFT/ARCHIVED/DEPRECATED) modules are restricted
    if (module.status !== 'ACTIVE') {
      const isPrivileged = req.user && (req.user.role === 'ADMIN' || req.user.role === 'MODERATOR');
      const isCreator = req.user && req.user.role === 'COURSE_CREATOR' && (module.createdBy === req.user.id || module.instructorId === req.user.id);

      // Unapproved DRAFT courses are strictly restricted to Administrators, Moderators, and the authoring Creator.
      // Ordinary enrolled students CANNOT access unapproved DRAFT courses.
      if (module.status === 'DRAFT') {
        if (!isPrivileged && !isCreator) {
          return res.status(404).json({
            success: false,
            error: 'COURSE_NOT_PUBLISHED',
            message: 'Course module not found or is currently not published.',
          });
        }
      } else {
        // ARCHIVED / DEPRECATED:
        // Accessible by privileged users, the course creator, or actively enrolled students
        let isEnrolled = false;
        if (req.user && req.user.id) {
          const assignment = await prisma.assignment.findUnique({
            where: { userId_moduleId: { userId: req.user.id, moduleId: id } },
          });
          isEnrolled = assignment && assignment.status !== 'EXPIRED';
        }

        if (!isPrivileged && !isCreator && !isEnrolled) {
          return res.status(404).json({
            success: false,
            error: 'COURSE_NOT_PUBLISHED',
            message: 'Course module not found or is currently not published.',
          });
        }
      }
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

    // Strict field allowlist to prevent mass-assignment
    const allowedFields = ['title', 'description', 'department', 'level', 'duration', 'type'];
    const updateData = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (req.body.code !== undefined && req.body.code !== existing.code) {
      const cleanCode = req.body.code.toUpperCase().trim();
      const codeConflict = await prisma.module.findUnique({ where: { code: cleanCode } });
      if (codeConflict && codeConflict.id !== id) {
        return res.status(409).json({ success: false, message: `Module code ${cleanCode} is already in use.` });
      }
      updateData.code = cleanCode;
    }

    if (req.body.status !== undefined) {
      if (req.user?.role === 'COURSE_CREATOR' && req.body.status === 'ACTIVE') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_COURSE_ACTIVATION',
          message: 'Course creators cannot activate or publish their own courses. Publication requires Administrator review and approval.',
        });
      }

      const allowedStatuses = req.user?.role === 'ADMIN'
        ? ['DRAFT', 'ACTIVE', 'ARCHIVED', 'DEPRECATED']
        : ['DRAFT'];

      if (!allowedStatuses.includes(req.body.status)) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_STATUS_TRANSITION',
          message: `Invalid course status or unauthorized transition to "${req.body.status}". Allowed values: ${allowedStatuses.join(', ')}`,
        });
      }
      updateData.status = req.body.status;
    }

    if (req.body.expiresMonths !== undefined) {
      const months = parseInt(req.body.expiresMonths, 10);
      if (!isNaN(months) && months > 0) {
        updateData.expiresMonths = months;
        updateData.expiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);
      }
    } else if (req.body.expiresAt !== undefined) {
      const d = new Date(req.body.expiresAt);
      if (!isNaN(d.getTime())) {
        updateData.expiresAt = d;
      }
    }

    if (outcomes !== undefined) {
      updateData.outcomes = Array.isArray(outcomes) ? JSON.stringify(outcomes) : (typeof outcomes === 'string' ? outcomes : null);
    }
    if (prerequisites !== undefined) {
      updateData.prerequisites = Array.isArray(prerequisites) ? JSON.stringify(prerequisites) : (typeof prerequisites === 'string' ? prerequisites : null);
    }

    // Only administrators may reassign instructor ownership
    if (req.user?.role === 'ADMIN') {
      if (req.body.instructorId !== undefined) updateData.instructorId = req.body.instructorId;
      if (req.body.instructorName !== undefined) updateData.instructorName = req.body.instructorName;
    }

    const module = await prisma.module.update({
      where: { id },
      data: updateData,
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

    if (assignment.status === 'EXPIRED') {
      return res.status(403).json({
        success: false,
        error: 'ASSIGNMENT_EXPIRED',
        message: 'Your enrollment assignment for this course has expired. You cannot submit lesson progress.',
      });
    }

    if (assignment.module && assignment.module.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: 'COURSE_INACTIVE',
        message: 'Cannot record progress for a course that is not currently active.',
      });
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
      include: { module: { select: { status: true, createdBy: true, instructorId: true } } },
    });

    if (!assignment) {
      return res.status(200).json({ success: true, enrolled: false, progress: 0, completedLessons: [] });
    }

    if (assignment.module?.status === 'DRAFT') {
      const isPrivileged = req.user && (req.user.role === 'ADMIN' || req.user.role === 'MODERATOR');
      const isCreator = req.user && (assignment.module.createdBy === req.user.id || assignment.module.instructorId === req.user.id);
      if (!isPrivileged && !isCreator) {
        return res.status(404).json({
          success: false,
          error: 'COURSE_NOT_PUBLISHED',
          message: 'Course module not found or is currently not published.',
        });
      }
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

    const isPrivileged = req.user && (req.user.role === 'ADMIN' || req.user.role === 'MODERATOR');
    const filteredAssignments = assignments.filter((a) => {
      if (!a.module) return false;
      if (a.module.status === 'DRAFT') {
        return isPrivileged || a.module.createdBy === req.user.id || a.module.instructorId === req.user.id;
      }
      return true;
    });

    return res.status(200).json({
      success: true,
      assignments: filteredAssignments.map((a) => {
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
    const resolvedUrl = resolveMediaUrl(relativeUrl, req);
    logger.info(`Lecture file uploaded successfully: ${req.file.originalname} -> ${resolvedUrl} (${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`);
    return res.status(200).json({
      success: true,
      fileUrl: resolvedUrl,
      relativeUrl,
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

