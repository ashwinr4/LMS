import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { logger } from './utils/logger.js';
import { isOriginAllowed, getAllowedOrigins, buildContentSecurityPolicyDirectives } from './utils/securityHeaders.js';
import { getUploadRootDir, getStorageDiagnostics } from './utils/storage.js';

dotenv.config();

// Ensure root uploads directory exists (local or persistent mount)
getUploadRootDir();

const app = express();
// Enable trust proxy for cloud deployment (Render, Railway, Vercel reverse proxies)
app.set('trust proxy', 1);

const server = http.createServer(app);
const PORT = process.env.PORT || 5050;

function getAccessSecret() {
  return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
}

// 1. Socket.io Initialization
export const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        logger.warn(`WebSocket connection blocked from unauthorized origin: ${origin}`);
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
});
app.set('io', io);

import { authenticateSocket, registerSocketHandlers } from './utils/socketAuth.js';

// Socket.io JWT Authentication Middleware
io.use(authenticateSocket);

io.on('connection', (socket) => {
  logger.info(`WebSocket Client Connected: ${socket.id} (User: ${socket.user?.email || 'Authenticated User'}, Role: ${socket.user?.role})`);
  registerSocketHandlers(socket, io);
});

// 2. Global Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: buildContentSecurityPolicyDirectives(),
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked unauthorized origin: ${origin}`);
        callback(new Error('Blocked by CORS security policy'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  })
);

// Cloud Health Check & Keep-Alive Endpoint
app.get('/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.status(200).json({ status: 'OK', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

// Serve static uploaded course videos, documents, and media with HTTP Range streaming support and security headers
app.use('/uploads', express.static(getUploadRootDir(), {
  acceptRanges: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const ext = path.extname(filePath).toLowerCase();
    // Allow inline playback/viewing for standard media formats; force attachment download for all other file types
    if (!['.mp4', '.webm', '.ogg', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  },
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Global & Authentication Rate Limiters
const globalLimiter = rateLimit({
  windowMs: Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.GLOBAL_RATE_LIMIT_MAX) || 1500, // 1500 req/15min ensures smooth playback and browsing
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 60, // Dedicated strict limiter for authentication endpoints
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 4. API Dynamic Cache-Control (Prevents intermediate caching of sensitive dynamic responses)
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// 5. Request Logging Middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});

// 6. Health Check Endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    system: 'Enterprise Secure Module Management System (ESMMS)',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

import authRoutes from './routes/authRoutes.js';
import certificateRoutes from './routes/certificateRoutes.js';
import moduleRoutes from './routes/moduleRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import assessmentRoutes from './routes/assessmentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import moderatorRoutes from './routes/moderatorRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import transferRoutes from './routes/transferRoutes.js';

// 7. Mount Modular API Routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/certificates', certificateRoutes);
app.use('/api/v1/modules', moduleRoutes);
app.use('/api/v1/enrollments', enrollmentRoutes);
app.use('/api/v1/assessments', assessmentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/moderator', moderatorRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/transfers', transferRoutes);

// 8. Root API Welcome Route
app.get('/api/v1', (req, res) => {
  res.status(200).json({
    message: 'Welcome to ESMMS API Gateway v1',
    documentation: '/api/v1/health',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      modules: '/api/v1/modules',
      enrollments: '/api/v1/enrollments',
      assessments: '/api/v1/assessments',
      certificates: '/api/v1/certificates',
    },
  });
});

// 9. Universal JSON 404 Handler for Unhandled Routes (Ensures consistent Content-Type)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: `API endpoint or resource ${req.originalUrl} does not exist on this server.`,
  });
});

// 10. Global Centralized Error Handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled Exception: ${err.message}`, { stack: err.stack });

  // Handle Body-Parser Malformed JSON syntax errors (from invalid request bodies)
  if ((err instanceof SyntaxError || err.type === 'entity.parse.failed') && (err.status === 400 || err.statusCode === 400)) {
    return res.status(400).json({
      success: false,
      error: 'MALFORMED_JSON_PAYLOAD',
      message: 'The request body contains invalid or malformed JSON payload.',
    });
  }

  // Map Prisma/database validation errors to 400 Bad Request
  if (err.name === 'PrismaClientValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data or parameter format.',
    });
  }

  // Map Prisma known request errors
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    });
  }

  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: 'DUPLICATE_ENTRY',
      message: 'A resource with this identifier already exists.',
    });
  }

  // Handle Multer upload errors and rejected file extensions as client errors (400)
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: 'UPLOAD_ERROR',
      message: err.code === 'LIMIT_FILE_SIZE' ? 'File size exceeds maximum allowable upload limit.' : err.message,
    });
  }

  if (err.message && err.message.startsWith('INVALID_FILE_TYPE')) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_FILE_TYPE',
      message: err.message.replace(/^INVALID_FILE_TYPE:\s*/, ''),
    });
  }

  res.status(500).json({
    success: false,
    error: 'SERVER_EXCEPTION',
    message: 'The server was unable to complete the request. Please try again later.',
  });
});

// 9. Process-Level Bulletproof Crash Guards (Prevents Server Down Time)
process.on('uncaughtException', (err) => {
  logger.error(`CRITICAL: Uncaught Exception caught by Crash Guard: ${err.message}`, { stack: err.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`CRITICAL: Unhandled Promise Rejection caught by Crash Guard: ${reason?.message || reason}`);
});

import { validateEnvironmentConfig } from './utils/envValidation.js';
import { prisma } from './utils/prisma.js';
export { validateEnvironmentConfig };

validateEnvironmentConfig();

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`====================================================`);
  logger.info(`🚀 ESMMS Backend Server running on port ${PORT} (0.0.0.0)`);
  logger.info(`📡 WebSocket Server initialized on port ${PORT}`);
  logger.info(`🔒 Security headers (Helmet) & CORS active for ${getAllowedOrigins().join(', ')}`);
  logger.info(`🩺 Health Check: http://localhost:${PORT}/api/v1/health`);
  logger.info(`====================================================`);

  // Asynchronously pre-warm primary database connection pool so cold starts don't delay client requests
  setImmediate(async () => {
    try {
      await prisma.user.findFirst({ select: { id: true } });
      logger.info('⚡ Primary database pool pre-warmed successfully.');
    } catch (err) {
      logger.warn(`Database pre-warm non-blocking warning: ${err.message}`);
    }
  });
});
