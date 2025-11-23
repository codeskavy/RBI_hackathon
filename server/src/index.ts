import express, { Express } from 'express';
import cors from 'cors';
import { config } from './config/sui.config';
import zkLoginRoutes from './routes/zklogin.routes';

const app: Express = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend URL
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/zklogin', zkLoginRoutes);

// Start server
app.listen(config.port, () => {
  console.log(`🚀 Server running on http://localhost:${config.port}`);
  console.log(`📡 Connected to Sui network: ${config.fullnodeUrl}`);
});