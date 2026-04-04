import './config/env.js'; // Must be first — validates all environment variables
import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';

import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { errorHandler } from './errors/errorHandler.js';
import { RateLimitError } from './errors/errorTypes.js';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import transactionsRouter from './routes/transactions.js';
import dashboardRouter from './routes/dashboard.js';
import categoriesRouter from './routes/categories.js';
import reportsRouter from './routes/reports.js';
import notificationsRouter from './routes/notifications.js';
import { setupSwagger } from './docs/swagger.js';

// App Initialization 

const app = express();

// Request ID Middleware  
// Attach a unique ID to every request so errors can be correlated in logs.
app.use((req, _res, next) => {
  req.id = uuidv4();
  next();
});

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie Parser 
// Required to read the httpOnly refresh token cookie on POST /auth/refresh
app.use(cookieParser());

// Request Logger
// Use 'combined' in production for standard Apache log format; 'dev' for terse dev output.
app.use(morgan(env.isDev ? 'dev' : 'combined'));

// Rate Limiters 

const rateLimitHandler = (_req, res) => {
  const err = new RateLimitError();
  return res.status(err.statusCode).json({
    success: false,
    error: {
      code: err.code,
      message: err.message,
      details: null,
      timestamp: new Date().toISOString(),
      requestId: _req.id ?? null,
    },
  });
};

// Auth routes: strict limit to slow brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Write operations: moderate limit
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Read / dashboard: generous limit
const readLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Routes 

app.use('/auth', authLimiter, authRouter);
app.use('/users', writeLimiter, usersRouter);
app.use('/transactions', writeLimiter, transactionsRouter);
app.use('/dashboard', readLimiter, dashboardRouter);
app.use('/categories', readLimiter, categoriesRouter);
app.use('/reports', readLimiter, reportsRouter);
app.use('/notifications', readLimiter, notificationsRouter);

// Swagger Documentation
setupSwagger(app);

// Health Check 
app.get('/health', readLimiter, (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// 404 Handler 
// Catches all routes not matched above. Returns JSON — never HTML.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      details: null,
      timestamp: new Date().toISOString(),
      requestId: req.id ?? null,
    },
  });
});

// Global Error Handler 
// Must be LAST middleware. Express identifies it by the 4-parameter signature.
app.use(errorHandler);

// Bootstrap  

async function start() {
  await connectDB();

  app.listen(env.port, () => {
    console.log(`[Server] Running on port ${env.port} in ${env.nodeEnv} mode`);
    console.log(`[Server] Health check: http://localhost:${env.port}/health`);
  });
}

start();

export default app;
