import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import webhookRoutes from './routes/webhookRoutes';

// Relaxed Env Var Check for Build Time (Render builds might not have all runtime vars)
const requiredEnvVars = ['JWT_SECRET', 'MONGO_URI'];

// Only check critical vars if we are actually starting the server (not just building)
if (process.env.NODE_ENV === 'production' && !process.env.CI) {
  const missingVars = requiredEnvVars.filter((key) => !process.env[key]);
  if (missingVars.length > 0) {
    console.warn(
      'WARNING: Missing recommended environment variables:',
      missingVars.join(', ')
    );
    // We don't exit(1) here to allow the build process to finish if it imports this file
  }
}

const app = express();
const PORT = process.env.PORT || 10000;

app.set('trust proxy', 1);

app.use(helmet() as any);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : [];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Check if the origin is in the allowed list
      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        process.env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      } else {
        console.warn(`BLOCKED CORS: Origin ${origin} is not allowed.`);
        return callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
    ],
  })
);

app.use(express.json({ limit: '10kb' }) as any);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Muitas requisições vindas deste IP, tente novamente mais tarde.',
  keyGenerator: (req: any) => {
    return req.ip || req.headers['x-forwarded-for'] || 'unknown';
  },
});

app.use('/api', limiter as any);

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.warn('MONGO_URI not defined, skipping DB connection');
    return;
  }
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('✅ Mongo FluxoClean conectado');
  } catch (err) {
    console.error('❌ MongoDB Error:', err);
    // process.exit(1); // Don't crash on connection fail, let it retry or fail gracefully
  }
};
connectDB();

// Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/webhooks', webhookRoutes);

app.get('/health', (req: Request, res: any) => {
  res.status(200).send('OK');
});

app.get('/', (req: Request, res: any) => {
  res.send('FluxoClean API Running');
});

app.use((err: any, req: Request, res: any, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor FluxoClean rodando na porta ${PORT}`);
});
