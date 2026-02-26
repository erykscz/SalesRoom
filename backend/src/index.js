import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from parent directory (local dev only)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (!process.env.VERCEL) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });
}

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import dealRoutes from './routes/deals.js';
import leadRoutes from './routes/leads.js';
import intentScraperRoutes from './routes/intent-scraper.js';
import transcriptRoutes from './routes/transcripts.js';
import salesRoomRoutes from './routes/sales-rooms.js';
import salesRoomPublicRoutes from './routes/sales-rooms-public.js';
import battlecardRoutes from './routes/battlecards.js';
import knowledgeRoutes from './routes/knowledge.js';
import notificationRoutes from './routes/notifications.js';
import managerRoutes from './routes/manager.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboard.js';
import icpTemplateRoutes from './routes/icp-templates.js';
import researchRoutes from './routes/research.js';

// Import middleware
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'https://objective-napier.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow any localhost origin in development
    if (process.env.NODE_ENV !== 'production' && origin && origin.match(/^http:\/\/localhost:\d+$/)) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// Serve uploaded files (local dev only; production uses Vercel Blob)
if (!process.env.VERCEL) {
  app.use('/api/uploads', express.static(path.resolve(__dirname, '../../data/uploads')));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.use('/api/sales-rooms/public', salesRoomPublicRoutes);

// Protected routes
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/deals', authMiddleware, dealRoutes);
app.use('/api/leads', authMiddleware, leadRoutes);
app.use('/api/intent-scraper', authMiddleware, intentScraperRoutes);
app.use('/api/transcripts', authMiddleware, transcriptRoutes);
app.use('/api/discovery', authMiddleware, transcriptRoutes);
app.use('/api/sales-rooms', authMiddleware, salesRoomRoutes);
app.use('/api/battlecards', authMiddleware, battlecardRoutes);
app.use('/api/knowledge', authMiddleware, knowledgeRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/manager', authMiddleware, managerRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/icp-templates', authMiddleware, icpTemplateRoutes);
app.use('/api/research', authMiddleware, researchRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server (local dev only; Vercel uses serverless wrapper)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Sales Room (Proces OS) - Backend API              ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                  ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
}

export default app;
