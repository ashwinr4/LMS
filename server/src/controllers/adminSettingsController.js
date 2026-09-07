import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

// Helper to mask sensitive passwords in connection strings
function maskDbUrl(url) {
  if (!url) return '';
  try {
    return url.replace(/:([^:@]+)@/, ':••••••••@');
  } catch {
    return 'postgresql://••••••••';
  }
}

// 1. GET DATABASE SETTINGS (Admin Only)
export async function getDatabaseSettings(req, res) {
  try {
    const primaryUrl = process.env.DATABASE_URL || '';
    const backupUrl = process.env.BACKUP_DB_URL || '';

    // Test primary health
    let primaryStatus = 'ONLINE';
    let primaryLatency = null;
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      primaryLatency = Date.now() - start;
    } catch (e) {
      primaryStatus = 'ERROR';
      logger.warn(`Primary DB health check warning: ${e.message}`);
    }

    // Test secondary health if configured
    let secondaryStatus = 'UNCONFIGURED';
    let secondaryLatency = null;
    const isSameCluster = primaryUrl === backupUrl;

    if (backupUrl && !isSameCluster) {
      const client = new pg.Client({ connectionString: backupUrl, connectionTimeoutMillis: 4000 });
      try {
        const start = Date.now();
        await client.connect();
        await client.query('SELECT 1');
        secondaryLatency = Date.now() - start;
        secondaryStatus = 'ONLINE';
      } catch (err) {
        secondaryStatus = 'ERROR';
        logger.warn(`Secondary DB health check warning: ${err.message}`);
      } finally {
        try { await client.end(); } catch {}
      }
    } else if (isSameCluster) {
      secondaryStatus = 'SYNCHRONIZED_CLUSTER';
      secondaryLatency = primaryLatency;
    }

    return res.status(200).json({
      success: true,
      settings: {
        primary: {
          url: maskDbUrl(primaryUrl),
          rawUrl: primaryUrl,
          status: primaryStatus,
          latencyMs: primaryLatency,
          poolSize: 20,
        },
        secondary: {
          url: maskDbUrl(backupUrl),
          rawUrl: backupUrl,
          status: secondaryStatus,
          latencyMs: secondaryLatency,
          poolSize: 10,
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

// 2. TEST DATABASE CONNECTION (Admin Only)
export async function testDatabaseConnection(req, res) {
  const { url } = req.body;

  if (!url || typeof url !== 'string' || !url.startsWith('postgres')) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid PostgreSQL connection string (starting with postgresql:// or postgres://).',
    });
  }

  const client = new pg.Client({
    connectionString: url.trim(),
    connectionTimeoutMillis: 5000,
  });

  try {
    const start = Date.now();
    await client.connect();
    const result = await client.query('SELECT version(), current_database() as dbname');
    const latencyMs = Date.now() - start;

    return res.status(200).json({
      success: true,
      message: 'Database connection verified successfully.',
      latencyMs,
      databaseName: result.rows[0]?.dbname || 'unknown',
      version: result.rows[0]?.version?.split(' on ')?.[0] || 'PostgreSQL',
    });
  } catch (error) {
    logger.warn(`Test DB Connection Failed: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: `Connection failed: ${error.message}`,
    });
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

// 3. UPDATE DATABASE SETTINGS (Admin Only)
export async function updateDatabaseSettings(req, res) {
  try {
    const { primaryUrl, backupUrl } = req.body;

    if (!primaryUrl || typeof primaryUrl !== 'string' || !primaryUrl.startsWith('postgres')) {
      return res.status(400).json({
        success: false,
        message: 'A valid Primary Database URL is required.',
      });
    }

    const trimmedPrimary = primaryUrl.trim();
    const trimmedBackup = (backupUrl && typeof backupUrl === 'string') ? backupUrl.trim() : trimmedPrimary;

    // 1. Pre-flight verification: test primary connection before committing
    const testClient = new pg.Client({
      connectionString: trimmedPrimary,
      connectionTimeoutMillis: 6000,
    });

    try {
      await testClient.connect();
      await testClient.query('SELECT 1');
    } catch (testErr) {
      return res.status(400).json({
        success: false,
        message: `Cannot switch database: Primary connection test failed (${testErr.message}). Previous database remains active.`,
      });
    } finally {
      try { await testClient.end(); } catch {}
    }

    // 2. Persist to server/.env file
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

    // Update process.env in memory
    process.env.DATABASE_URL = trimmedPrimary;
    process.env.BACKUP_DB_URL = trimmedBackup;

    // 3. Record Audit Log for Security Compliance
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
      message: 'Database configuration successfully updated and persisted.',
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
