// server.js
// Amazon Seller Dashboard — Express Backend

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security Middleware ──
app.use(helmet());
app.use(express.json());

// CORS — allow your frontend
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://amazon-dashboard-pearl.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'null',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting — protect against abuse and Amazon API throttling
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 requests per minute per IP
  message: { error: 'Too many requests, please slow down.' },
});
app.use('/api/', limiter);

// ── Routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/analytics', require('./routes/analytics'));

// ── Health Check ──
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Amazon Seller Dashboard API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: {
      marketplace: process.env.SP_API_MARKETPLACE_ID || 'not set',
      region: process.env.SP_API_REGION || 'not set',
      credentialsConfigured: !!(process.env.LWA_CLIENT_ID && !process.env.LWA_CLIENT_ID.includes('REPLACE_ME')),
    },
  });
});

// ── API Overview ──
app.get('/api', (req, res) => {
  res.json({
    name: 'Amazon Seller Dashboard API',
    endpoints: {
      'GET /health': 'Server health check',
      'GET /api/auth/status': 'Check SP-API connection status',
      'GET /api/auth/marketplaces': 'List your Amazon marketplaces',
      'GET /api/orders': 'List recent orders (query: days, status, limit)',
      'GET /api/orders/:orderId': 'Get single order + items',
      'GET /api/orders/summary/revenue': 'Revenue totals (query: days)',
      'GET /api/inventory': 'FBA inventory summary',
      'GET /api/inventory/listings': 'All active listings',
      'GET /api/inventory/restock': 'Restock recommendations',
      'GET /api/analytics/sales': 'Sales metrics (query: interval, startDate, endDate)',
      'POST /api/analytics/report': 'Request a bulk report',
      'GET /api/analytics/report/:reportId': 'Check report status + get download URL',
      'GET /api/analytics/fees': 'Estimate FBA fees (query: asin, price)',
    },
  });
});

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global Error Handler ──
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── Start Server ──
app.listen(PORT, () => {
  console.log(`\n🚀 Amazon Seller Dashboard API running on http://localhost:${PORT}`);
  console.log(`📋 API overview: http://localhost:${PORT}/api`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  console.log(`🔑 Auth status:  http://localhost:${PORT}/api/auth/status\n`);

  if (!process.env.LWA_CLIENT_ID || process.env.LWA_CLIENT_ID.includes('REPLACE_ME')) {
    console.warn('⚠️  Warning: Credentials not configured. Copy .env.example to .env and fill in your credentials.\n');
  }
});
