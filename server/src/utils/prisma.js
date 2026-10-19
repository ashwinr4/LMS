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
  (process.env.DATABASE_URL?.startsWith('postgres') ? process.env.DATABASE_URL : null);

export const isPgConfigured = Boolean(pgUrl && typeof pgUrl === 'string' && pgUrl.trim());

let pgPool = null;
let pgAdapter = null;
export let pgPrisma = null;

if (isPgConfigured) {
  pgPool = new pg.Pool({
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

  pgAdapter = new PrismaPg(pgPool);
  pgPrisma =
    globalForPrisma.pgPrisma ||
    new PrismaClient({
      adapter: pgAdapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.pgPrisma = pgPrisma;
  }
}

// 2. MongoDB Native Engine
const mongoUrl =
  process.env.MONGODB_URL ||
  (process.env.DATABASE_URL?.startsWith('mongodb') ? process.env.DATABASE_URL : null) ||
  (process.env.BACKUP_DB_URL?.startsWith('mongodb') ? process.env.BACKUP_DB_URL : null);

export const isMongoConfigured = Boolean(mongoUrl && typeof mongoUrl === 'string' && mongoUrl.trim());

export let mongoPrisma = isMongoConfigured ? new MongoAdapter(mongoUrl) : null;

// 3. Dynamic Active Engine Router
let currentEngine =
  process.env.ACTIVE_PRIMARY_ENGINE ||
  (process.env.DATABASE_URL?.startsWith('mongodb') ? 'mongodb' : 'postgresql');

// Safe fallback to configured engine if specified default engine is not configured
if (currentEngine === 'postgresql' && !isPgConfigured && isMongoConfigured) {
  currentEngine = 'mongodb';
} else if (currentEngine === 'mongodb' && !isMongoConfigured && isPgConfigured) {
  currentEngine = 'postgresql';
}

let activeClient = currentEngine === 'mongodb' ? mongoPrisma : pgPrisma;
let backupClient = currentEngine === 'mongodb' ? pgPrisma : mongoPrisma;

logger.info(
  `✅ Universal Database Gateway Initialized. Active Primary: ${currentEngine.toUpperCase()} (Standby Backup: ${
    backupClient ? (currentEngine === 'mongodb' ? 'POSTGRESQL' : 'MONGODB') : 'NONE'
  })`
);

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
        return activeClient ? activeClient[modelProp] : undefined;
      }

      // $transaction pass-through
      if (modelProp === '$transaction') {
        if (activeClient && typeof activeClient.$transaction === 'function') {
          return activeClient.$transaction.bind(activeClient);
        }
        // Never claim sequential execution is atomic; throw explicit error if provider lacks transaction support
        return async function () {
          const err = new Error(
            `TRANSACTION_UNSUPPORTED: The active database provider (${currentEngine.toUpperCase()}) does not support multi-record ACID transactions or rollback.`
          );
          err.code = 'TRANSACTION_UNSUPPORTED';
          throw err;
        };
      }

      if (!activeClient) {
        throw new Error(`Database client for ${currentEngine} is not configured or connection string is missing.`);
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
  const SUPPORTED_ENGINES = ['postgresql', 'mongodb'];
  if (!SUPPORTED_ENGINES.includes(targetEngine)) {
    throw new Error(
      `Unsupported database provider: "${targetEngine}". Currently, only PostgreSQL and MongoDB Atlas engines are supported by the runtime gateway.`
    );
  }

  if (targetEngine === 'mongodb') {
    if (!isMongoConfigured && !targetUrl) {
      throw new Error('Cannot switch to MongoDB: No MongoDB connection URL is configured in the environment.');
    }
    if (targetUrl) {
      if (!mongoPrisma) {
        mongoPrisma = new MongoAdapter(targetUrl);
      } else {
        mongoPrisma.url = targetUrl;
      }
    }
    activeClient = mongoPrisma;
    backupClient = isPgConfigured ? pgPrisma : null;
    currentEngine = 'mongodb';
  } else if (targetEngine === 'postgresql') {
    if (!isPgConfigured && !targetUrl) {
      throw new Error('Cannot switch to PostgreSQL: No PostgreSQL connection URL is configured in the environment.');
    }
    activeClient = pgPrisma;
    backupClient = isMongoConfigured ? mongoPrisma : null;
    currentEngine = 'postgresql';
  }

  logger.info(`🔄 [Universal DB Switcher] Runtime Primary Engine switched to: ${currentEngine.toUpperCase()}`);
  return {
    activeEngine: currentEngine,
    backupEngine: currentEngine === 'mongodb' ? (isPgConfigured ? 'postgresql' : null) : (isMongoConfigured ? 'mongodb' : null),
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
        logger.debug(
          `[Dual-Write Sync] Replicated ${action} on ${modelName} to backup (${
            currentEngine === 'mongodb' ? 'PostgreSQL' : 'MongoDB'
          }).`
        );
      }
    } catch (syncErr) {
      logger.warn(`[Dual-Write Sync Notice] Could not replicate ${action} on ${modelName} to backup: ${syncErr.message}`);
    }
  });
}

// 4. Automated Database Failover Health Watchdog
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_FAILOVER = 3; // 3 consecutive failures to avoid flapping on transient network blips
let lastFailoverTimestamp = 0;
const FAILOVER_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown between failovers

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
    logger.warn(
      `[Health Watchdog] Primary Database (${currentEngine.toUpperCase()}) health check failed (${consecutiveFailures}/${MAX_FAILURES_BEFORE_FAILOVER}): ${err.message}`
    );

    if (consecutiveFailures >= MAX_FAILURES_BEFORE_FAILOVER) {
      const fallbackEngine = currentEngine === 'mongodb' ? 'postgresql' : 'mongodb';
      const isFallbackConfigured = fallbackEngine === 'mongodb' ? isMongoConfigured : isPgConfigured;

      // 1. Check if backup is configured
      if (!isFallbackConfigured || !backupClient) {
        logger.error(
          `🚨 [Health Watchdog Alert] Primary Database (${currentEngine.toUpperCase()}) is unresponsive, but NO standby backup database is configured. Retaining primary configuration and awaiting connection recovery.`
        );
        consecutiveFailures = 0;
        return;
      }

      // 2. Cooldown check to prevent rapid flapping
      const now = Date.now();
      if (now - lastFailoverTimestamp < FAILOVER_COOLDOWN_MS) {
        logger.warn(
          `[Health Watchdog] Failover suppressed: Cooldown active (${Math.round(
            (FAILOVER_COOLDOWN_MS - (now - lastFailoverTimestamp)) / 1000
          )}s remaining).`
        );
        return;
      }

      // 3. Pre-flight health check on backup BEFORE switching
      try {
        logger.info(`[Health Watchdog] Testing standby backup database (${fallbackEngine.toUpperCase()}) reachability before failover...`);
        if (backupClient.user && typeof backupClient.user.findFirst === 'function') {
          await Promise.race([
            backupClient.user.findFirst({ select: { id: true } }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Backup health check timeout (4000ms)')), 4000)),
          ]);
        }
      } catch (backupErr) {
        logger.error(
          `🚨 [CRITICAL FAILOVER ABORTED] Standby backup database (${fallbackEngine.toUpperCase()}) is ALSO unreachable (${backupErr.message}). Retaining primary configuration to avoid total outage.`
        );
        consecutiveFailures = 0;
        return;
      }

      // 4. Standby is verified healthy -> execute safe failover
      logger.error(
        `🚨 [CRITICAL FAILOVER] Promoting verified Standby Backup Database (${fallbackEngine.toUpperCase()}) to Active Primary...`
      );
      try {
        switchActiveEngine(fallbackEngine);
        lastFailoverTimestamp = Date.now();
        consecutiveFailures = 0;
        logger.info(
          `✅ [FAILOVER SUCCESS] Active Primary successfully promoted to ${fallbackEngine.toUpperCase()}. Standby backup is serving live queries.`
        );
      } catch (switchErr) {
        logger.error(`[FAILOVER ERROR] Failed to switch active engine: ${switchErr.message}`);
      }
    }
  }
}

// Start non-intrusive heartbeat watchdog (checks every 15s)
const watchdogInterval = setInterval(checkDatabaseHealth, 15000);
if (watchdogInterval.unref) {
  watchdogInterval.unref();
}

export { backupClient as backupPrisma };
