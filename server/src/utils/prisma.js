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

const MUTATION_ACTIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

// Dynamic Universal Proxy: forwards reads to active engine and replicates mutations to backup
export const prisma = new Proxy(
  {},
  {
    get(target, modelProp) {
      if (typeof modelProp === 'symbol' || modelProp === 'then') {
        return activeClient[modelProp];
      }
      const activeModel = activeClient[modelProp];
      if (!activeModel || typeof activeModel !== 'object') {
        return activeModel;
      }

      return new Proxy(activeModel, {
        get(mTarget, actionProp) {
          const origFn = mTarget[actionProp];
          if (typeof origFn !== 'function') {
            return origFn;
          }

          return async function (...args) {
            // Execute on active primary database
            const result = await origFn.apply(mTarget, args);

            // Replicate mutations to standby backup database
            if (MUTATION_ACTIONS.has(actionProp) && backupClient) {
              replicateToBackup(modelProp, actionProp, args[0]);
            }

            return result;
          };
        },
      });
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
      logger.warn(`[Dual-Write Sync Notice] Could not replicate ${action} on ${modelName} to backup: ${syncErr.message}`);
    }
  });
}

// 4. Automated Database Failover Health Watchdog
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_FAILOVER = 2;

async function checkDatabaseHealth() {
  try {
    if (activeClient && activeClient.user && typeof activeClient.user.findFirst === 'function') {
      await Promise.race([
        activeClient.user.findFirst({ select: { id: true } }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Health check query timeout (5000ms)')), 5000)),
      ]);
      consecutiveFailures = 0;
    }
  } catch (err) {
    consecutiveFailures++;
    logger.warn(`[Health Watchdog] Primary Database (${currentEngine.toUpperCase()}) health check failed (${consecutiveFailures}/${MAX_FAILURES_BEFORE_FAILOVER}): ${err.message}`);

    if (consecutiveFailures >= MAX_FAILURES_BEFORE_FAILOVER) {
      const fallbackEngine = currentEngine === 'mongodb' ? 'postgresql' : 'mongodb';
      logger.error(`🚨 [CRITICAL FAILOVER] Primary Database (${currentEngine.toUpperCase()}) is unreachable. Promoting Backup Database (${fallbackEngine.toUpperCase()}) to Active Primary...`);
      
      switchActiveEngine(fallbackEngine);
      consecutiveFailures = 0;
      logger.info(`✅ [FAILOVER SUCCESS] Active Primary promoted to ${fallbackEngine.toUpperCase()}. Incoming traffic safeguarded.`);
    }
  }
}

// Start non-intrusive heartbeat watchdog (checks every 15s)
const watchdogInterval = setInterval(checkDatabaseHealth, 15000);
if (watchdogInterval.unref) {
  watchdogInterval.unref();
}

export { backupClient as backupPrisma };
