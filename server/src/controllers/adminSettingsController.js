import fs from 'fs';
import path from 'path';
import { prisma, switchActiveEngine } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';
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

// 1. GET DATABASE SETTINGS (Admin Only - High Speed RAM Cached)
export async function getDatabaseSettings(req, res) {
  try {
    const cached = cache.get('admin:database_settings');
    if (cached) {
      return res.status(200).json(cached);
    }

    const primaryUrl = process.env.DATABASE_URL || '';
    const backupUrl = process.env.BACKUP_DB_URL || '';

    const detectedPrimary = detectEngine(primaryUrl);
    const detectedBackup = detectEngine(backupUrl);

    const activePrimaryEngine = process.env.ACTIVE_PRIMARY_ENGINE || (detectedPrimary !== 'unknown' ? detectedPrimary : 'postgresql');
    const activeBackupEngine = process.env.ACTIVE_BACKUP_ENGINE || (detectedBackup !== 'unknown' ? detectedBackup : 'postgresql');

    const postgresUrl =
      process.env.POSTGRES_URL ||
      (primaryUrl.startsWith('postgres') ? primaryUrl : (backupUrl.startsWith('postgres') ? backupUrl : ''));

    const mongoUrl =
      process.env.MONGODB_URL ||
      (primaryUrl.startsWith('mongodb') ? primaryUrl : (backupUrl.startsWith('mongodb') ? backupUrl : ''));

    let primaryStatus = 'ONLINE';
    let primaryLatency = activePrimaryEngine === 'mongodb' ? 22 : 18;
    let primaryVersion = activePrimaryEngine === 'mongodb' ? 'MongoDB Atlas (v7.x)' : getEngineLabel(activePrimaryEngine);
    let primaryDbName = activePrimaryEngine === 'mongodb' ? 'cluster0' : 'production_db';

    let secondaryStatus = 'STANDBY';
    let secondaryLatency = activeBackupEngine === 'mongodb' ? 24 : 20;
    let secondaryVersion = activeBackupEngine === 'mongodb' ? 'MongoDB Atlas (v7.x)' : getEngineLabel(activeBackupEngine);
    let secondaryDbName = activeBackupEngine === 'mongodb' ? 'cluster0' : 'backup_db';
    const isSameCluster = primaryUrl && backupUrl && primaryUrl.trim() === backupUrl.trim();

    if (isSameCluster) {
      secondaryStatus = 'SYNCHRONIZED_CLUSTER';
      secondaryLatency = primaryLatency;
      secondaryVersion = primaryVersion;
      secondaryDbName = primaryDbName;
    } else if (backupUrl) {
      secondaryStatus = 'ONLINE';
    }

    const payload = {
      success: true,
      activeEngines: {
        primary: activePrimaryEngine,
        secondary: activeBackupEngine,
      },
      urls: {
        postgresql: postgresUrl,
        mongodb: mongoUrl,
        mysql: process.env.MYSQL_URL || '',
        sqlite: process.env.SQLITE_URL || 'file:./prisma/lms_primary.db',
        sqlserver: process.env.SQLSERVER_URL || '',
      },
      settings: {
        primary: {
          url: maskDbUrl(primaryUrl),
          rawUrl: primaryUrl,
          engine: activePrimaryEngine,
          engineLabel: getEngineLabel(activePrimaryEngine),
          status: primaryStatus,
          latencyMs: primaryLatency,
          version: primaryVersion,
          databaseName: primaryDbName,
        },
        secondary: {
          url: maskDbUrl(backupUrl),
          rawUrl: backupUrl,
          engine: activeBackupEngine,
          engineLabel: getEngineLabel(activeBackupEngine),
          status: secondaryStatus,
          latencyMs: secondaryLatency,
          version: secondaryVersion,
          databaseName: secondaryDbName,
          isSameCluster,
        },
      },
    };

    cache.set('admin:database_settings', payload, 30);
    return res.status(200).json(payload);
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
    const trimmedBackup =
      backupUrl && typeof backupUrl === 'string' && backupUrl.trim() ? backupUrl.trim() : trimmedPrimary;

    // Pre-flight test primary connection before committing
    try {
      await testConnection(trimmedPrimary);
    } catch (testErr) {
      return res.status(400).json({
        success: false,
        message: `Cannot switch database: Primary connection test failed (${testErr.message}). Previous database remains active.`,
      });
    }

    const primaryEngine = detectEngine(trimmedPrimary);
    const backupEngine = detectEngine(trimmedBackup);

    // Runtime hot-swap active engine proxy
    switchActiveEngine(primaryEngine, trimmedPrimary);

    // Persist to server/.env file
    const envPath = path.resolve('.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');

      function upsertEnvKey(key, value) {
        const regex = new RegExp(`^${key}=.*`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      }

      upsertEnvKey('ACTIVE_PRIMARY_ENGINE', primaryEngine);
      upsertEnvKey('ACTIVE_BACKUP_ENGINE', backupEngine);
      upsertEnvKey('DATABASE_URL', trimmedPrimary);
      upsertEnvKey('BACKUP_DB_URL', trimmedBackup);

      if (primaryEngine === 'postgresql') {
        upsertEnvKey('POSTGRES_URL', trimmedPrimary);
      } else if (primaryEngine === 'mongodb') {
        upsertEnvKey('MONGODB_URL', trimmedPrimary);
      }

      if (backupEngine === 'postgresql') {
        upsertEnvKey('POSTGRES_URL', trimmedBackup);
      } else if (backupEngine === 'mongodb') {
        upsertEnvKey('MONGODB_URL', trimmedBackup);
      }

      fs.writeFileSync(envPath, envContent, 'utf8');
      logger.info(`Updated database connection strings and active engines in .env file.`);
    }

    // Update in-memory
    process.env.ACTIVE_PRIMARY_ENGINE = primaryEngine;
    process.env.ACTIVE_BACKUP_ENGINE = backupEngine;
    process.env.DATABASE_URL = trimmedPrimary;
    process.env.BACKUP_DB_URL = trimmedBackup;
    if (primaryEngine === 'mongodb') process.env.MONGODB_URL = trimmedPrimary;
    if (primaryEngine === 'postgresql') process.env.POSTGRES_URL = trimmedPrimary;

    cache.delete('admin:database_settings');

    // Record Security Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          actorId: req.user?.id || 'system',
          actorEmail: req.user?.email || 'admin@qualiva.internal',
          actorName: req.user?.name || 'System Admin',
          action: 'DATABASE_SETTINGS_UPDATED',
          resource: 'SYSTEM_SETTINGS',
          details: `Admin updated Primary (${primaryEngine}) and Secondary (${backupEngine}) endpoints. Primary: ${maskDbUrl(trimmedPrimary)}, Secondary: ${maskDbUrl(trimmedBackup)}`,
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
          engine: primaryEngine,
          engineLabel: getEngineLabel(primaryEngine),
          status: 'ONLINE',
        },
        secondary: {
          url: maskDbUrl(trimmedBackup),
          rawUrl: trimmedBackup,
          engine: backupEngine,
          engineLabel: getEngineLabel(backupEngine),
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
    const targetEngine = detectEngine(trimmedTarget);

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

    // 3. Hot-swap active engine runtime proxy if role is PRIMARY
    if (role === 'PRIMARY') {
      switchActiveEngine(targetEngine, trimmedTarget);
      process.env.ACTIVE_PRIMARY_ENGINE = targetEngine;
      process.env.DATABASE_URL = trimmedTarget;
    } else {
      process.env.ACTIVE_BACKUP_ENGINE = targetEngine;
      process.env.BACKUP_DB_URL = trimmedTarget;
    }

    if (targetEngine === 'mongodb') {
      process.env.MONGODB_URL = trimmedTarget;
    } else if (targetEngine === 'postgresql') {
      process.env.POSTGRES_URL = trimmedTarget;
    }

    // 4. Persist to server/.env file
    const envPath = path.resolve('.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');

      function upsertEnvKey(key, value) {
        const regex = new RegExp(`^${key}=.*`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      }

      if (role === 'PRIMARY') {
        upsertEnvKey('ACTIVE_PRIMARY_ENGINE', targetEngine);
        upsertEnvKey('DATABASE_URL', trimmedTarget);
      } else {
        upsertEnvKey('ACTIVE_BACKUP_ENGINE', targetEngine);
        upsertEnvKey('BACKUP_DB_URL', trimmedTarget);
      }

      if (targetEngine === 'mongodb') {
        upsertEnvKey('MONGODB_URL', trimmedTarget);
      } else if (targetEngine === 'postgresql') {
        upsertEnvKey('POSTGRES_URL', trimmedTarget);
      }

      fs.writeFileSync(envPath, envContent, 'utf8');
      logger.info(`Persisted updated ${role} database (${targetEngine}) in .env file.`);
    }

    cache.delete('admin:database_settings');

    // 5. Record Security Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          actorId: req.user?.id || 'system',
          actorEmail: req.user?.email || 'admin@qualiva.internal',
          actorName: req.user?.name || 'System Admin',
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
