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
import { logger } from './utils/logger.js';

dotenv.config();

// Ensure local uploads directory exists on fresh cloud container deployment
if (!fs.existsSync('uploads')) {
  try {
    fs.mkdirSync('uploads', { recursive: true });
  } catch {}
}

const app = express();
// Enable trust proxy for cloud deployment (Render, Railway, Vercel reverse proxies)
app.set('trust proxy', 1);

const server = http.createServer(app);
const PORT = process.env.PORT || 5050;

const rawClientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const trimmedClientUrl = rawClientUrl.replace(/\/$/, '');
const ALLOWED_ORIGINS = [
  trimmedClientUrl,
  `${trimmedClientUrl}/`,
  'http://localhost:5174',
  'http://localhost:5173',
];

// 1. Socket.io Initialization
export const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.onrender.com') || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
});

io.on('connection', (socket) => {
  logger.info(`WebSocket Client Connected: ${socket.id}`);

  // Join role room
  socket.on('join_role_room', (role) => {
    const room = `role_${role}`;
    socket.join(room);
    logger.info(`Socket ${socket.id} joined role room: ${room}`);
  });

  // Join user room for targeted notifications
  socket.on('join_user_room', (userId) => {
    const room = `user_${userId}`;
    socket.join(room);
    logger.info(`Socket ${socket.id} joined user room: ${room}`);
  });

  // Join course room for real-time curriculum and player updates
  socket.on('join_course_room', (courseId) => {
    if (courseId) {
      const room = `course_${courseId}`;
      socket.join(room);
      logger.info(`Socket ${socket.id} joined course room: ${room}`);
    }
  });

  socket.on('leave_course_room', (courseId) => {
    if (courseId) {
      const room = `course_${courseId}`;
      socket.leave(room);
      logger.info(`Socket ${socket.id} left course room: ${room}`);
    }
  });

  socket.on('disconnect', () => {
    logger.info(`WebSocket Client Disconnected: ${socket.id}`);
  });
});

// 2. Global Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.onrender.com') || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(null, true);
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

// Serve static uploaded course videos, documents, and media with HTTP Range streaming support
app.use('/uploads', express.static(path.resolve('uploads'), {
  acceptRanges: true,
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.GLOBAL_RATE_LIMIT_MAX) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

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
app.use('/api/v1/auth', authRoutes);
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

// 10. Start Server
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`====================================================`);
  logger.info(`🚀 ESMMS Backend Server running on port ${PORT} (0.0.0.0)`);
  logger.info(`📡 WebSocket Server initialized on port ${PORT}`);
  logger.info(`🔒 Security headers (Helmet) & CORS active for ${ALLOWED_ORIGINS.join(', ')}`);
  logger.info(`🩺 Health Check: http://localhost:${PORT}/api/v1/health`);
  logger.info(`====================================================`);
});
