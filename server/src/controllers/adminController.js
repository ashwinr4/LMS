import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { sendPasswordResetEmail } from '../utils/email.js';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { io } from '../server.js';

// ═══════════════════════════════════════════════════════════════════
// 1. ADMIN USER DIRECTORY & LIFECYCLE
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/users
 * List users with pagination, role, status, department, and text search
 */
export async function listUsers(req, res) {
  try {
    const { role, status, department, search, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};
    if (role && role !== 'ALL') where.role = role;
    if (status && status !== 'ALL') where.status = status;
    if (department && department !== 'ALL') where.department = department;

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { department: { contains: q } },
      ];
    }

    const [users, total, totalActive, totalLocked, totalSuspended, totalCreators, totalAdmins] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          department: true,
          phone: true,
          location: true,
          avatar: true,
          failedLoginAttempts: true,
          lockUntil: true,
          lastActive: true,
          passwordResetRequested: true,
          passwordResetRequestedAt: true,
          createdAt: true,
          _count: {
            select: {
              assignments: true,
              certificates: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'LOCKED' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count({ where: { role: 'COURSE_CREATOR' } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
    ]);

    return res.status(200).json({
      success: true,
      users,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take) || 1,
      },
      stats: {
        total,
        active: totalActive,
        locked: totalLocked,
        suspended: totalSuspended,
        creators: totalCreators,
        admins: totalAdmins,
      },
    });
  } catch (error) {
    logger.error(`Admin List Users Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}

/**
 * POST /api/v1/admin/users
 * Manually create enterprise user
 */
export async function createUser(req, res) {
  try {
    const { email, name, role = 'USER', department, temporaryPassword, phone, location } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'VALIDATION', message: 'Email and full name are required.' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'EMAIL_EXISTS', message: 'A user with this email address already exists.' });
    }

    const passwordToHash = temporaryPassword || 'QualivaPass2026!';
    const passwordHash = await bcrypt.hash(passwordToHash, 12);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role: role.toUpperCase(),
        department: department || 'General Engineering',
        phone: phone || null,
        location: location || null,
        passwordHash,
        mustChangePassword: true,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        department: true,
        status: true,
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorName: req.user.name,
        action: 'USER_CREATED_BY_ADMIN',
        resource: `User: ${user.email} (${user.role})`,
        details: `Administrator manually provisioned user account. Temporary password set.`,
        riskLevel: 'LOW',
      },
    });

    logger.info(`Admin ${req.user.email} created user: ${user.email} (${user.role})`);
    return res.status(201).json({ success: true, message: 'User created successfully.', user });
  } catch (error) {
    logger.error(`Admin Create User Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'CREATE_FAILED', message: error.message });
  }
}

/**
 * PATCH /api/v1/admin/users/:id/status
 * Update user status: ACTIVE | LOCKED | SUSPENDED
 */
export async function updateUserStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['ACTIVE', 'LOCKED', 'SUSPENDED', 'PENDING_APPROVAL'].includes(status)) {
      return res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Invalid status value.' });
    }

    if (id === req.user.id && (status === 'LOCKED' || status === 'SUSPENDED')) {
      return res.status(400).json({ success: false, error: 'SELF_LOCK_FORBIDDEN', message: 'You cannot lock or suspend your own account.' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        status,
        failedLoginAttempts: status === 'ACTIVE' ? 0 : undefined,
        lockUntil: status === 'ACTIVE' ? null : undefined,
      },
      select: { id: true, email: true, name: true, role: true, status: true },
    });

    // If locking or suspending, revoke active sessions
    if (status === 'LOCKED' || status === 'SUSPENDED') {
      await prisma.activeSession.updateMany({
        where: { userId: id },
        data: { isRevoked: true },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorName: req.user.name,
        action: `USER_STATUS_${status}`,
        resource: `User: ${user.email}`,
        details: reason ? `Status changed to ${status}. Reason: ${reason}` : `Status changed to ${status}`,
        riskLevel: status === 'ACTIVE' ? 'LOW' : 'MEDIUM',
      },
    });

    logger.info(`Admin ${req.user.email} changed user ${user.email} status to ${status}`);
    return res.status(200).json({ success: true, message: `User status updated to ${status}.`, user });
  } catch (error) {
    logger.error(`Admin Update Status Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'UPDATE_FAILED', message: error.message });
  }
}

/**
 * PATCH /api/v1/admin/users/:id/role
 * Update user role: ADMIN | MODERATOR | COURSE_CREATOR | USER
 */
export async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['ADMIN', 'MODERATOR', 'COURSE_CREATOR', 'USER'].includes(role)) {
      return res.status(400).json({ success: false, error: 'INVALID_ROLE', message: 'Invalid role value.' });
    }

    if (id === req.user.id && role !== 'ADMIN') {
      return res.status(400).json({ success: false, error: 'SELF_DEMOTION_FORBIDDEN', message: 'You cannot demote your own administrator role.' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, name: true, role: true, department: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorName: req.user.name,
        action: 'USER_ROLE_CHANGED',
        resource: `User: ${user.email}`,
        details: `Assigned new RBAC role: ${role}`,
        riskLevel: role === 'ADMIN' ? 'HIGH' : 'MEDIUM',
      },
    });

    logger.info(`Admin ${req.user.email} changed user ${user.email} role to ${role}`);

    // Create Notification and Broadcast to User
    try {
      await prisma.notification.create({
        data: {
          recipientId: user.id,
          title: '🛡️ Portal Access Role Updated',
          message: `Your enterprise portal access level has been updated to ${role}.`,
          type: 'SYSTEM',
        },
      });
      if (io) {
        io.to(`user_${user.id}`).emit('user_role_updated', { role });
        io.to(`user_${user.id}`).emit('system_notification', {
          title: '🛡️ Portal Access Role Updated',
          message: `Your enterprise portal access level has been updated to ${role}.`,
          type: 'SYSTEM',
        });
      }
    } catch (notifErr) {
      logger.warn(`Failed to create role update notification: ${notifErr.message}`);
    }

    return res.status(200).json({ success: true, message: `User role updated to ${role}.`, user });
  } catch (error) {
    logger.error(`Admin Update Role Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'UPDATE_FAILED', message: error.message });
  }
}

/**
 * POST /api/v1/admin/users/:id/reset-password
 * Reset user password with a new temporary password
 */
export async function resetUserPassword(req, res) {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const tempPass = newPassword || `Qualiva${Math.floor(100000 + Math.random() * 900000)}!`;
    const passwordHash = await bcrypt.hash(tempPass, 12);

    const user = await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        passwordResetRequested: false,
        passwordResetRequestedAt: null,
      },
      select: { id: true, email: true, name: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorName: req.user.name,
        action: 'USER_PASSWORD_RESET_ADMIN',
        resource: `User: ${user.email}`,
        details: 'Admin triggered credential reset. mustChangePassword set to true.',
        riskLevel: 'MEDIUM',
      },
    });

    // Create In-App Notification for User
    try {
      await prisma.notification.create({
        data: {
          recipientId: user.id,
          title: '🔑 Password Reset by Administrator',
          message: 'An administrator has reset your password. Temporary credentials have been emailed to you.',
          type: 'SYSTEM',
        },
      });
      if (io) {
        io.to(`user_${user.id}`).emit('system_notification', {
          title: '🔑 Password Reset by Administrator',
          message: 'An administrator has reset your password. Check your email for temporary credentials.',
          type: 'SYSTEM',
        });
        io.to('role_ADMIN').emit('password_reset_completed', { userId: user.id });
      }
    } catch (notifErr) {
      logger.warn(`Failed to create reset notification: ${notifErr.message}`);
    }

    // Dispatch live email to user with new temporary password
    await sendPasswordResetEmail(user.email, tempPass, user.name);

    return res.status(200).json({
      success: true,
      message: `Password reset successfully for ${user.email}. Temporary credentials emailed.`,
      temporaryPassword: tempPass,
    });
  } catch (error) {
    logger.error(`Admin Password Reset Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'RESET_FAILED', message: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. BULK XLSX / CSV USER IMPORT
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/admin/users/bulk-import
 * Supports both dry-run validation mode and live execution
 */
export async function bulkImportUsers(req, res) {
  try {
    const { dryRun = true, defaultRole = 'USER', defaultPassword = 'QualivaPass2026!' } = req.body;
    let rows = [];

    // Check if uploaded via Multer file or JSON array in body
    if (req.file) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(firstSheet);
    } else if (Array.isArray(req.body.users)) {
      rows = req.body.users;
    } else if (req.body.csvText) {
      const workbook = XLSX.read(req.body.csvText, { type: 'string' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(firstSheet);
    } else {
      return res.status(400).json({
        success: false,
        error: 'NO_DATA',
        message: 'No file or user rows provided for bulk import.',
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'EMPTY_FILE', message: 'Import sheet contains no rows.' });
    }

    // Get existing emails to detect duplicates
    const existingUsers = await prisma.user.findMany({ select: { email: true } });
    const existingEmailSet = new Set(existingUsers.map((u) => u.email.toLowerCase()));

    const validatedRows = [];
    const validEmailsInBatch = new Set();
    let validCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      // Normalize column names (case-insensitive keys)
      const normalized = {};
      Object.keys(raw).forEach((k) => {
        normalized[k.toLowerCase().trim()] = raw[k];
      });

      const email = (normalized.email || normalized['e-mail'] || normalized['email address'] || '').toString().toLowerCase().trim();
      const name = (normalized.name || normalized['full name'] || normalized.fullname || normalized['student name'] || '').toString().trim();
      const department = (normalized.department || normalized.dept || 'General Engineering').toString().trim();
      const role = (normalized.role || defaultRole).toString().toUpperCase().trim();
      const phone = (normalized.phone || normalized['phone number'] || '').toString().trim() || null;
      const location = (normalized.location || normalized.city || '').toString().trim() || null;

      const errors = [];
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email) {
        errors.push('Missing email address');
      } else if (!emailRegex.test(email)) {
        errors.push('Invalid email format');
      } else if (existingEmailSet.has(email)) {
        errors.push('Email already exists in system');
      } else if (validEmailsInBatch.has(email)) {
        errors.push('Duplicate email within import file');
      }

      if (!name) {
        errors.push('Missing full name');
      }

      if (!['ADMIN', 'MODERATOR', 'COURSE_CREATOR', 'USER'].includes(role)) {
        errors.push(`Invalid role: "${role}". Must be USER, COURSE_CREATOR, MODERATOR, or ADMIN`);
      }

      const isValid = errors.length === 0;
      if (isValid) {
        validCount++;
        validEmailsInBatch.add(email);
      } else {
        errorCount++;
      }

      validatedRows.push({
        rowNumber: i + 2, // Excel 1-based index (header is 1)
        email,
        name,
        department,
        role: ['ADMIN', 'MODERATOR', 'COURSE_CREATOR', 'USER'].includes(role) ? role : defaultRole,
        phone,
        location,
        isValid,
        errors,
      });
    }

    // If DRY RUN: Return preview validation report
    if (dryRun === true || dryRun === 'true') {
      return res.status(200).json({
        success: true,
        mode: 'DRY_RUN',
        summary: {
          totalRows: rows.length,
          validRows: validCount,
          invalidRows: errorCount,
        },
        rows: validatedRows,
      });
    }

    // LIVE IMPORT: Create valid users in batch
    const validRowsToCreate = validatedRows.filter((r) => r.isValid);
    if (validRowsToCreate.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_VALID_ROWS',
        message: 'No valid rows found to import. Please review validation errors.',
        summary: { totalRows: rows.length, validRows: 0, invalidRows: errorCount },
        rows: validatedRows,
      });
    }

    const defaultPasswordHash = await bcrypt.hash(defaultPassword, 12);
    const createdUsers = [];

    for (const row of validRowsToCreate) {
      const u = await prisma.user.create({
        data: {
          email: row.email,
          name: row.name,
          department: row.department,
          role: row.role,
          phone: row.phone,
          location: row.location,
          passwordHash: defaultPasswordHash,
          mustChangePassword: true,
          status: 'ACTIVE',
        },
        select: { id: true, email: true, name: true, role: true, department: true },
      });
      createdUsers.push(u);
    }

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorName: req.user.name,
        action: 'BULK_USER_IMPORT_COMPLETED',
        resource: `Imported ${createdUsers.length} Enterprise Users`,
        details: `Bulk XLSX/CSV import completed. ${createdUsers.length} created, ${errorCount} rejected.`,
        riskLevel: 'MEDIUM',
      },
    });

    logger.info(`Admin ${req.user.email} executed bulk import: ${createdUsers.length} users created.`);
    return res.status(201).json({
      success: true,
      mode: 'EXECUTE',
      message: `Successfully imported ${createdUsers.length} enterprise users.`,
      summary: {
        totalRows: rows.length,
        importedCount: createdUsers.length,
        skippedCount: errorCount,
      },
      createdUsers,
      rows: validatedRows,
    });
  } catch (error) {
    logger.error(`Bulk Import Users Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'IMPORT_FAILED', message: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. COURSE LIFECYCLE & AUTOMATIC EXPIRATION
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/courses
 * List all courses with lifecycle statuses, enrollment stats, and expiration countdown
 */
export async function listAllCourses(req, res) {
  try {
    const modules = await prisma.module.findMany({
      include: {
        _count: {
          select: {
            assignments: true,
            sections: true,
            assessments: true,
            certificates: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const formatted = modules.map((m) => {
      const expiresAt = m.expiresAt ? new Date(m.expiresAt) : null;
      const isExpired = expiresAt ? expiresAt < now : false;
      const daysUntilExpiration = expiresAt
        ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        id: m.id,
        code: m.code,
        title: m.title,
        department: m.department,
        level: m.level,
        status: isExpired && m.status === 'ACTIVE' ? 'ARCHIVED' : m.status,
        duration: m.duration,
        instructorName: m.instructorName,
        expiresMonths: m.expiresMonths,
        expiresAt: m.expiresAt,
        daysUntilExpiration,
        isExpired,
        studentCount: m._count.assignments,
        sectionCount: m._count.sections,
        assessmentCount: m._count.assessments,
        certificateCount: m._count.certificates,
        createdAt: m.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      count: formatted.length,
      courses: formatted,
    });
  } catch (error) {
    logger.error(`Admin List Courses Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}

/**
 * PATCH /api/v1/admin/courses/:id/status
 * Update course lifecycle status (DRAFT | ACTIVE | ARCHIVED | DEPRECATED) or extend expiration
 */
export async function updateCourseStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, extendMonths, expiresAt } = req.body;

    const existing = await prisma.module.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Course module not found.' });
    }

    const data = {};
    if (status) {
      if (!['DRAFT', 'ACTIVE', 'ARCHIVED', 'DEPRECATED'].includes(status)) {
        return res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Invalid status.' });
      }
      data.status = status;
    }

    if (expiresAt) {
      const newExpiry = new Date(expiresAt);
      if (!isNaN(newExpiry.getTime())) {
        data.expiresAt = newExpiry;
        if (newExpiry > new Date() && existing.status === 'ARCHIVED') {
          data.status = 'ACTIVE';
        }
      }
    } else if (extendMonths && Number(extendMonths) > 0) {
      const currentExpiry = existing.expiresAt ? new Date(existing.expiresAt) : new Date();
      const newExpiry = new Date(currentExpiry.getTime() + Number(extendMonths) * 30 * 24 * 60 * 60 * 1000);
      data.expiresAt = newExpiry;
      data.expiresMonths = existing.expiresMonths + Number(extendMonths);
      if (existing.status === 'ARCHIVED') data.status = 'ACTIVE';
    }

    const updated = await prisma.module.update({
      where: { id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorName: req.user.name,
        action: 'COURSE_LIFECYCLE_UPDATED',
        resource: `Module: ${updated.code} - ${updated.title}`,
        details: `Status: ${updated.status}. Expiration: ${updated.expiresAt}`,
        riskLevel: 'LOW',
      },
    });

    return res.status(200).json({ success: true, message: 'Course lifecycle updated.', module: updated });
  } catch (error) {
    logger.error(`Admin Update Course Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'UPDATE_FAILED', message: error.message });
  }
}

/**
 * POST /api/v1/admin/courses/check-expirations
 * Automated 12-month lifecycle expiration sweep: auto-archives past-due courses
 */
export async function runExpirationSweep(req, res) {
  try {
    const now = new Date();
    const expiredModules = await prisma.module.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: now },
      },
    });

    if (expiredModules.length > 0) {
      await prisma.module.updateMany({
        where: {
          id: { in: expiredModules.map((m) => m.id) },
        },
        data: { status: 'ARCHIVED' },
      });

      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          actorEmail: req.user.email,
          actorName: req.user.name,
          action: 'COURSE_EXPIRATION_SWEEP_EXECUTED',
          resource: `${expiredModules.length} Modules Auto-Archived`,
          details: `Lifecycle engine archived expired courses: ${expiredModules.map((m) => m.code).join(', ')}`,
          riskLevel: 'LOW',
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Expiration sweep completed. ${expiredModules.length} courses archived.`,
      archivedCount: expiredModules.length,
      archivedModules: expiredModules.map((m) => ({ id: m.id, code: m.code, title: m.title })),
    });
  } catch (error) {
    logger.error(`Expiration Sweep Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'SWEEP_FAILED', message: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. IMMUTABLE SECURITY AUDIT LOGS HUB
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/audit-logs
 * List security audit logs with risk filtering and search
 */
export async function listAuditLogs(req, res) {
  try {
    const { riskLevel, action, search, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};
    if (riskLevel && riskLevel !== 'ALL') where.riskLevel = riskLevel;
    if (action && action !== 'ALL') where.action = action;

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { actorEmail: { contains: q } },
        { actorName: { contains: q } },
        { action: { contains: q } },
        { resource: { contains: q } },
        { details: { contains: q } },
      ];
    }

    const [logs, total, totalHigh, totalMedium, totalLow] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { riskLevel: 'HIGH' } }),
      prisma.auditLog.count({ where: { riskLevel: 'MEDIUM' } }),
      prisma.auditLog.count({ where: { riskLevel: 'LOW' } }),
    ]);

    return res.status(200).json({
      success: true,
      logs,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take) || 1,
      },
      stats: {
        total,
        high: totalHigh,
        medium: totalMedium,
        low: totalLow,
      },
    });
  } catch (error) {
    logger.error(`Admin List Audit Logs Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. MODERATOR PORTAL CONTROLLERS
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/moderator/users
 * Read-only user directory for moderators
 */
export async function listModeratorUsers(req, res) {
  try {
    const { role, department, search, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};
    if (role && role !== 'ALL') where.role = role;
    if (department && department !== 'ALL') where.department = department;
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { department: { contains: q } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          department: true,
          location: true,
          createdAt: true,
          lastActive: true,
        },
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      users,
      pagination: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (error) {
    logger.error(`Moderator List Users Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}

/**
 * GET /api/v1/moderator/courses
 * Course quality review queue for moderators
 */
export async function listModeratorCourses(req, res) {
  try {
    const modules = await prisma.module.findMany({
      include: {
        sections: {
          include: { lessons: true },
        },
        assessments: true,
        _count: { select: { assignments: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const reviewed = modules.map((m) => {
      const totalLessons = m.sections.reduce((sum, s) => sum + s.lessons.length, 0);
      const hasAssessment = m.assessments.length > 0;
      const qualityScore = Math.min(
        100,
        (m.description ? 20 : 0) +
          (m.outcomes ? 20 : 0) +
          (totalLessons >= 3 ? 30 : totalLessons * 10) +
          (hasAssessment ? 30 : 0)
      );

      return {
        id: m.id,
        code: m.code,
        title: m.title,
        department: m.department,
        status: m.status,
        instructorName: m.instructorName,
        totalSections: m.sections.length,
        totalLessons,
        hasAssessment,
        qualityScore,
        studentCount: m._count.assignments,
        updatedAt: m.updatedAt,
      };
    });

    return res.status(200).json({ success: true, courses: reviewed });
  } catch (error) {
    logger.error(`Moderator List Courses Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}

/**
 * GET /api/v1/admin/dashboard-summary
 * Aggregates live system KPIs, pending approvals queue, and recent user activity
 */
export async function getDashboardSummary(req, res) {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeModules,
      underReviewModules,
      pendingApprovals,
      todayActivityCount,
      recentPendingApprovals,
      recentActivityLogs,
    ] = await Promise.all([
      // 1. Total Provisioned Users
      prisma.user.count(),
      // 2. Active Course Modules
      prisma.module.count({ where: { status: 'ACTIVE' } }),
      // Draft / Under Review modules
      prisma.module.count({ where: { status: 'DRAFT' } }),
      // 3. Pending Approvals
      prisma.courseEnrollmentRequest.count({
        where: { status: { in: ['FORWARDED_TO_ADMIN', 'PENDING_CREATOR'] } },
      }),
      // 4. Platform Activity Today
      prisma.auditLog.count({
        where: { createdAt: { gte: todayStart } },
      }),
      // Live Pending Approvals (top 5)
      prisma.courseEnrollmentRequest.findMany({
        where: { status: { in: ['FORWARDED_TO_ADMIN', 'PENDING_CREATOR'] } },
        include: {
          student: { select: { id: true, name: true, email: true, department: true, avatar: true } },
          module: { select: { id: true, code: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      // Live Recent Member Activity (top 5)
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeModules,
        underReviewModules,
        pendingApprovals,
        todayActivityCount,
      },
      recentApprovals: recentPendingApprovals,
      recentActivity: recentActivityLogs,
    });
  } catch (error) {
    logger.error(`Admin Dashboard Summary Error: ${error.message}`);
    return res.status(500).json({ success: false, error: 'FETCH_FAILED', message: error.message });
  }
}

/**
 * GET /api/v1/admin/badge-counts
 * Fast indexed count queries for Admin Sidebar Badges
 */
export async function getAdminBadgeCounts(req, res) {
  try {
    const [pendingApprovals, passwordResetRequests] = await Promise.all([
      prisma.courseEnrollmentRequest.count({
        where: { status: 'FORWARDED_TO_ADMIN' },
      }),
      prisma.user.count({
        where: { passwordResetRequested: true },
      }),
    ]);

    return res.status(200).json({
      success: true,
      counts: {
        pendingApprovals,
        passwordResetRequests,
      },
    });
  } catch (error) {
    logger.error(`Get Admin Badge Counts Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      counts: { pendingApprovals: 0, passwordResetRequests: 0 },
    });
  }
}
