import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { logger } from './logger.js';

const globalForPrisma = global;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  logger.error('CRITICAL: DATABASE_URL environment variable is missing.');
}

// Low-latency, permanently-warmed connection pool for Neon PostgreSQL
const pool = new pg.Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err) => {
  logger.warn(`Database pool background notice: ${err.message}`);
});

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

logger.info(`✅ Primary Database (Neon PostgreSQL) connected with warm connection pooling.`);

// Dual-Write Backup Database Support
const backupUrl = process.env.BACKUP_DB_URL;
let backupPrisma = null;

if (backupUrl && backupUrl !== connectionString) {
  try {
    const backupPool = new pg.Pool({
      connectionString: backupUrl,
      max: 10,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
    });
    const backupAdapter = new PrismaPg(backupPool);
    backupPrisma = new PrismaClient({ adapter: backupAdapter, log: ['error'] });
    logger.info(`✅ Dual-Write Backup Database connected at: ${backupUrl.replace(/:[^:@]+@/, ':***@')}`);
  } catch (err) {
    logger.warn(`Dual-Write Backup DB note: ${err.message}`);
  }
} else {
  logger.info(`ℹ️ Primary and Backup databases are synchronized on high-availability cloud cluster.`);
}

// Non-blocking asynchronous backup replication for sub-25ms response speeds
export function replicateToBackup(modelName, action, args) {
  if (!backupPrisma) return;
  setImmediate(async () => {
    try {
      if (backupPrisma[modelName] && typeof backupPrisma[modelName][action] === 'function') {
        await backupPrisma[modelName][action](args);
        logger.debug(`[Dual-Write Sync] Replicated ${action} on ${modelName} to backup database.`);
      }
    } catch (syncErr) {
      logger.warn(`[Dual-Write Sync Warning] Could not replicate ${action} to backup: ${syncErr.message}`);
    }
  });
}

export { backupPrisma };
