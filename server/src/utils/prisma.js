import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { logger } from './logger.js';
import { MongoAdapter } from './mongoAdapter.js';

const globalForPrisma = global;

// 1. PostgreSQL Native Prisma Engine
const pgUrl =
  process.env.POSTGRES_URL ||
  (process.env.DATABASE_URL?.startsWith('postgres') ? process.env.DATABASE_URL : null) ||
  'postgresql://localhost:5432/lms';

const pgPool = new pg.Pool({
  connectionString: pgUrl,
  max: 20,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pgPool.on('error', (err) => {
  logger.warn(`PostgreSQL connection pool notice: ${err.message}`);
});

const pgAdapter = new PrismaPg(pgPool);
export const pgPrisma =
  globalForPrisma.pgPrisma ||
  new PrismaClient({
    adapter: pgAdapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.pgPrisma = pgPrisma;
}

// 2. MongoDB Native Engine
const mongoUrl =
  process.env.MONGODB_URL ||
  (process.env.DATABASE_URL?.startsWith('mongodb') ? process.env.DATABASE_URL : null) ||
  (process.env.BACKUP_DB_URL?.startsWith('mongodb') ? process.env.BACKUP_DB_URL : null) ||
  'mongodb://localhost:27017/lms';

export const mongoPrisma = new MongoAdapter(mongoUrl);

// 3. Dynamic Active Engine Router
let currentEngine =
  process.env.ACTIVE_PRIMARY_ENGINE ||
  (process.env.DATABASE_URL?.startsWith('mongodb') ? 'mongodb' : 'postgresql');

let activeClient = currentEngine === 'mongodb' ? mongoPrisma : pgPrisma;
let backupClient = currentEngine === 'mongodb' ? pgPrisma : mongoPrisma;

logger.info(`✅ Universal Database Gateway Initialized. Active Primary: ${currentEngine.toUpperCase()}`);

// Dynamic Universal Proxy: all controller prisma calls forward to active engine
export const prisma = new Proxy(
  {},
  {
    get(target, prop) {
      return activeClient[prop];
    },
  }
);

// Hot-swap active database engine at runtime without restarting server
export function switchActiveEngine(targetEngine, targetUrl) {
  if (targetEngine === 'mongodb') {
    if (targetUrl) {
      mongoPrisma.url = targetUrl;
    }
    activeClient = mongoPrisma;
    backupClient = pgPrisma;
    currentEngine = 'mongodb';
  } else {
    activeClient = pgPrisma;
    backupClient = mongoPrisma;
    currentEngine = 'postgresql';
  }
  logger.info(`🔄 [Universal DB Switcher] Runtime Primary Engine switched to: ${currentEngine.toUpperCase()}`);
  return {
    activeEngine: currentEngine,
    backupEngine: currentEngine === 'mongodb' ? 'postgresql' : 'mongodb',
  };
}

export function getActiveEngine() {
  return currentEngine;
}

// Bi-directional Dual-Write Replication
export function replicateToBackup(modelName, action, args) {
  if (!backupClient) return;
  setImmediate(async () => {
    try {
      if (backupClient[modelName] && typeof backupClient[modelName][action] === 'function') {
        await backupClient[modelName][action](args);
        logger.debug(`[Dual-Write Sync] Replicated ${action} on ${modelName} to backup (${currentEngine === 'mongodb' ? 'PostgreSQL' : 'MongoDB'}).`);
      }
    } catch (syncErr) {
      logger.warn(`[Dual-Write Sync Warning] Could not replicate ${action} to backup: ${syncErr.message}`);
    }
  });
}

export { backupClient as backupPrisma };
