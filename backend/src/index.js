import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// Load environment variables
// Session 5: Added health_score filter support
dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import dealRoutes from './routes/deals.js';
import leadRoutes from './routes/leads.js';
import intentScraperRoutes from './routes/intent-scraper.js';
import transcriptRoutes from './routes/transcripts.js';
import salesRoomRoutes from './routes/sales-rooms.js';
import battlecardRoutes from './routes/battlecards.js';
import knowledgeRoutes from './routes/knowledge.js';
import notificationRoutes from './routes/notifications.js';
import managerRoutes from './routes/manager.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboard.js';

// Import middleware
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRoutes);
app.use('/api/sales-rooms/public', salesRoomRoutes);

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

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // Handle different message types
      if (data.type === 'subscribe') {
        ws.userId = data.userId;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Broadcast function for notifications
export function broadcastNotification(userId, notification) {
  wss.clients.forEach((client) => {
    if (client.userId === userId && client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'notification',
        data: notification
      }));
    }
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Sales Room (Proces OS) - Backend API              ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                  ║
║  WebSocket on ws://localhost:${PORT}/ws                      ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
