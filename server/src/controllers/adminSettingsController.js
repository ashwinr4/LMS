import fs from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import {
  detectEngine,
  getEngineLabel,
  testConnection,
  migrateDataBetweenDatabases,
} from '../utils/databaseManager.js';

// Helper to mask sensitive passwords in connection strings
function maskDbUrl(url) {
  if (!url) return '';
  try {
    return url.replace(/:([^:@]+)@/, ':••••••••@');
  } catch {
    return '••••••••';
  }
}

// 1. GET DATABASE SETTINGS (Admin Only)
export async function getDatabaseSettings(req, res) {
  try {
    const primaryUrl = process.env.DATABASE_URL || '';
    const backupUrl = process.env.BACKUP_DB_URL || '';

    const primaryEngine = detectEngine(primaryUrl);
    const backupEngine = detectEngine(backupUrl);

    // Live test primary health
    let primaryStatus = 'ONLINE';
    let primaryLatency = null;
    let primaryVersion = 'Auto-Detected';
    let primaryDbName = 'primary_db';

    try {
      const testRes = await testConnection(primaryUrl);
      primaryLatency = testRes.latencyMs;
      primaryVersion = testRes.version;
      primaryDbName = testRes.databaseName;
      primaryStatus = 'ONLINE';
    } catch (e) {
      primaryStatus = 'ERROR';
      logger.warn(`Primary DB health diagnostic note: ${e.message}`);
    }

    // Live test secondary health if configured
    let secondaryStatus = 'STANDBY';
    let secondaryLatency = null;
    let secondaryVersion = 'Auto-Detected';
    let secondaryDbName = 'backup_db';
    const isSameCluster = primaryUrl && backupUrl && primaryUrl.trim() === backupUrl.trim();

    if (backupUrl && !isSameCluster) {
      try {
        const testRes = await testConnection(backupUrl);
        secondaryLatency = testRes.latencyMs;
        secondaryVersion = testRes.version;
        secondaryDbName = testRes.databaseName;
        secondaryStatus = 'ONLINE';
      } catch (err) {
        secondaryStatus = 'ERROR';
        logger.warn(`Secondary DB diagnostic note: ${err.message}`);
      }
    } else if (isSameCluster) {
      secondaryStatus = 'SYNCHRONIZED_CLUSTER';
      secondaryLatency = primaryLatency;
      secondaryVersion = primaryVersion;
      secondaryDbName = primaryDbName;
    }

    return res.status(200).json({
      success: true,
      settings: {
        primary: {
          url: maskDbUrl(primaryUrl),
          rawUrl: primaryUrl,
          engine: primaryEngine,
          engineLabel: getEngineLabel(primaryEngine),
          status: primaryStatus,
          latencyMs: primaryLatency,
          version: primaryVersion,
          databaseName: primaryDbName,
        },
        secondary: {
          url: maskDbUrl(backupUrl),
          rawUrl: backupUrl,
          engine: backupEngine,
          engineLabel: getEngineLabel(backupEngine),
          status: secondaryStatus,
          latencyMs: secondaryLatency,
          version: secondaryVersion,
          databaseName: secondaryDbName,
          isSameCluster,
        },
      },
    });
  } catch (error) {
    logger.error(`Get Database Settings Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve database configuration.',
    });
  }
}

// 2. TEST DATABASE CONNECTION (Admin Only - Multi-Engine)
export async function testDatabaseConnection(req, res) {
  const { url } = req.body;

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Database connection URL cannot be empty. Please enter a valid connection string.',
    });
  }

  try {
    const result = await testConnection(url.trim());
    return res.status(200).json(result);
  } catch (error) {
    logger.warn(`Test DB Connection Diagnostic: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message || 'Connection test failed.',
    });
  }
}

// 3. UPDATE DATABASE SETTINGS (Admin Only)
export async function updateDatabaseSettings(req, res) {
  try {
    const { primaryUrl, backupUrl } = req.body;

    if (!primaryUrl || typeof primaryUrl !== 'string' || !primaryUrl.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A valid, non-empty Primary Database URL is required.',
      });
    }

    const trimmedPrimary = primaryUrl.trim();
    const trimmedBackup = (backupUrl && typeof backupUrl === 'string' && backupUrl.trim())
      ? backupUrl.trim()
      : trimmedPrimary;

    // Pre-flight test primary connection before committing
    try {
      await testConnection(trimmedPrimary);
    } catch (testErr) {
      return res.status(400).json({
        success: false,
        message: `Cannot switch database: Primary connection test failed (${testErr.message}). Previous database remains active.`,
      });
    }

    // Persist to server/.env file
    const envPath = path.resolve('.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');

      // Update DATABASE_URL
      if (envContent.includes('DATABASE_URL=')) {
        envContent = envContent.replace(/DATABASE_URL=.*/g, `DATABASE_URL=${trimmedPrimary}`);
      } else {
        envContent += `\nDATABASE_URL=${trimmedPrimary}`;
      }

      // Update BACKUP_DB_URL
      if (envContent.includes('BACKUP_DB_URL=')) {
        envContent = envContent.replace(/BACKUP_DB_URL=.*/g, `BACKUP_DB_URL=${trimmedBackup}`);
      } else {
        envContent += `\nBACKUP_DB_URL=${trimmedBackup}`;
      }

      fs.writeFileSync(envPath, envContent, 'utf8');
      logger.info(`Updated database connection strings in .env file.`);
    }

    // Update in-memory
    process.env.DATABASE_URL = trimmedPrimary;
    process.env.BACKUP_DB_URL = trimmedBackup;

    // Record Security Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          actorEmail: req.user.email,
          actorName: req.user.name,
          action: 'DATABASE_SETTINGS_UPDATED',
          resource: 'SYSTEM_SETTINGS',
          details: `Admin updated Primary and Secondary Database endpoints. Primary: ${maskDbUrl(trimmedPrimary)}, Secondary: ${maskDbUrl(trimmedBackup)}`,
          riskLevel: 'HIGH',
          ipAddress: req.ip,
        },
      });
    } catch (auditErr) {
      logger.warn(`Failed to write database settings audit log: ${auditErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Database configuration successfully updated and saved.',
      settings: {
        primary: {
          url: maskDbUrl(trimmedPrimary),
          rawUrl: trimmedPrimary,
          status: 'ONLINE',
        },
        secondary: {
          url: maskDbUrl(trimmedBackup),
          rawUrl: trimmedBackup,
          status: trimmedPrimary === trimmedBackup ? 'SYNCHRONIZED_CLUSTER' : 'ONLINE',
        },
      },
    });
  } catch (error) {
    logger.error(`Update Database Settings Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to update database configuration.',
    });
  }
}

// 4. MIGRATE & ACTIVATE DATABASE (Admin Only - Zero-Data-Loss Pipeline)
export async function migrateAndActivateDatabase(req, res) {
  try {
    const { targetUrl, role = 'PRIMARY', shouldMigrateData = true } = req.body;

    if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A valid, non-empty target connection URL is required.',
      });
    }

    const trimmedTarget = targetUrl.trim();

    // 1. Pre-flight verification
    let testResult;
    try {
      testResult = await testConnection(trimmedTarget);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: `Pre-flight test failed: ${err.message}. Previous database remains fully active.`,
      });
    }

    // 2. Automated data migration pipeline
    let migrationDetails = null;
    if (shouldMigrateData) {
      try {
        migrationDetails = await migrateDataBetweenDatabases(trimmedTarget);
      } catch (migErr) {
        logger.error(`[Database Migration Error] ${migErr.message}`);
        return res.status(500).json({
          success: false,
          message: `Data migration failed: ${migErr.message}. Switch aborted, original database remains active.`,
        });
      }
    }

    // 3. Persist to server/.env file
    const envPath = path.resolve('.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');

      if (role === 'PRIMARY') {
        if (envContent.includes('DATABASE_URL=')) {
          envContent = envContent.replace(/DATABASE_URL=.*/g, `DATABASE_URL=${trimmedTarget}`);
        } else {
          envContent += `\nDATABASE_URL=${trimmedTarget}`;
        }
        process.env.DATABASE_URL = trimmedTarget;
      } else {
        if (envContent.includes('BACKUP_DB_URL=')) {
          envContent = envContent.replace(/BACKUP_DB_URL=.*/g, `BACKUP_DB_URL=${trimmedTarget}`);
        } else {
          envContent += `\nBACKUP_DB_URL=${trimmedTarget}`;
        }
        process.env.BACKUP_DB_URL = trimmedTarget;
      }

      fs.writeFileSync(envPath, envContent, 'utf8');
      logger.info(`Persisted updated ${role} database in .env file.`);
    }

    // 4. Record Security Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          actorEmail: req.user.email,
          actorName: req.user.name,
          action: 'DATABASE_MIGRATION_COMPLETED',
          resource: 'SYSTEM_SETTINGS',
          details: `Admin successfully activated ${testResult.engineLabel} as ${role} database. Migrated records: ${migrationDetails?.totalRecords || 0}`,
          riskLevel: 'CRITICAL',
          ipAddress: req.ip,
        },
      });
    } catch (auditErr) {
      logger.warn(`Failed to write migration audit log: ${auditErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully migrated and activated ${testResult.engineLabel} as ${role} database!`,
      details: {
        role,
        engine: testResult.engine,
        engineLabel: testResult.engineLabel,
        databaseName: testResult.databaseName,
        totalRecordsMigrated: migrationDetails?.totalRecords || 0,
        summary: migrationDetails?.summary || {},
      },
    });
  } catch (error) {
    logger.error(`Migrate and Activate Database Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to complete database migration.',
    });
  }
}
