import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import webhookRoutes from './routes/webhookRoutes';

const requiredEnvVars = [
  'JWT_SECRET',
  'MONGO_URI',
  'API_BASE_URL',
  'FLUXOCLEAN_HOME',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
];

const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.error('FATAL ERROR: Missing required environment variables:');
  missingVars.forEach((v) => console.error(` - ${v}`));
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);

app.use(helmet() as any);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        const msg = `The CORS policy for this site does not allow access from the specified Origin.`;
        return callback(new Error(msg), false);
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
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('✅ Mongo FluxoClean conectado com sucesso');
  } catch (err) {
    console.error('❌ MongoDB Error:', err);
    process.exit(1);
  }
};
connectDB();

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/webhooks', webhookRoutes);

app.get('/health', (req: Request, res: any) => {
  res.status(200).send('OK');
});

app.get('/', (req: Request, res: any) => {
  res.send('FluxoClean API Secured & Running');
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
