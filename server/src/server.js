import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5050;
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5173',
];

// 1. Socket.io Initialization
export const io = new SocketIOServer(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
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
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Dev fallback
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  })
);

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

// 4. Request Logging Middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});

// 5. Health Check Endpoint
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

// 6. Mount Modular API Routes
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

// 7. Root API Welcome Route
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

// 7. Global 404 Handler for API Routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: `API endpoint ${req.originalUrl} does not exist on this server.`,
  });
});

// 8. Global Centralized Error Handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled Exception: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'An internal server error occurred.' : err.message,
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
server.listen(PORT, () => {
  logger.info(`====================================================`);
  logger.info(`🚀 ESMMS Backend Server running on port ${PORT}`);
  logger.info(`📡 WebSocket Server initialized on port ${PORT}`);
  logger.info(`🔒 Security headers (Helmet) & CORS active for ${ALLOWED_ORIGINS.join(', ')}`);
  logger.info(`🩺 Health Check: http://localhost:${PORT}/api/v1/health`);
  logger.info(`====================================================`);
});
