const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const questionRoutes = require('./routes/questionRoutes');
const responseRoutes = require('./routes/responseRoutes');
const anonymousRoutes = require('./routes/anonymousRoutes');
const adminRoutes = require('./routes/adminRoutes');
const SocketService = require('./services/socketService');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:7011',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://www.gravatar.com"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false // Allow embedding for QR codes
}));

// CSRF protection: Not required. Authentication uses Bearer tokens (Authorization header)
// and custom X-Anonymous-Token headers, which browsers do not auto-attach on cross-origin
// requests. This makes CSRF attacks infeasible without a separate XSS vulnerability.

// CORS middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:7011',
  credentials: true
}));

// Rate limiting - general API limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !!(req.headers.authorization || req.headers['x-anonymous-token'] || req.path.startsWith('/api/anonymous/'))
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply general rate limit to all requests
app.use(generalLimiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/responses', responseRoutes);
app.use('/api/anonymous', anonymousRoutes);
app.use('/api/admin', adminRoutes);

// Initialize Socket.IO service
const socketService = new SocketService(io);

// Make socket service available to controllers via app.get('socketService')
app.set('socketService', socketService);

// Error handling middleware
app.use((err, req, res, next) => {

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 7012;

server.listen(PORT, '0.0.0.0');

module.exports = { app, server, io, socketService };
