const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Import des routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const parkingRoutes = require('./routes/parking');
const reservationRoutes = require('./routes/reservations');
const paymentRoutes = require('./routes/payments');
const webhookRoutes = require('./routes/webhooks');
const balanceRoutes = require('./routes/balance');
const favoriteRoutes = require('./routes/favorites');

// Import des middlewares
const { errorHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

// Configuration de sécurité
app.use(helmet());

// Configuration CORS
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.100.12:3000',
    'http://localhost:53467',
    'http://127.0.0.1:53467',
    'http://192.168.100.12:53467',
    'http://localhost:54053',
    'http://127.0.0.1:54053',
    'http://192.168.100.12:54053',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://192.168.100.12:8080',
    'http://localhost:64811',
    'http://127.0.0.1:64811',
    'http://192.168.100.12:64811',
    'http://localhost:53816',
    'http://127.0.0.1:53816',
    'http://192.168.100.12:53816',
    'http://localhost:60502',
    'http://127.0.0.1:60502',
    'http://192.168.100.12:60502',
    'http://localhost:61458',
    'http://127.0.0.1:61458',
    'http://192.168.100.12:61458',
    'http://localhost:51910',
    'http://127.0.0.1:51910',
    'http://192.168.100.12:51910',
    'http://localhost:50273',
    'http://127.0.0.1:50273',
    'http://192.168.100.12:50273'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
}));

// Rate limiting (désactivé temporairement pour le développement)
// const limiter = rateLimit({
//   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
//   max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limite par IP
//   message: {
//     error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.'
//   }
// });
// app.use(limiter);

// Routes webhooks (AVANT le middleware JSON!)
app.use('/api/webhooks', webhookRoutes);

// Middleware pour parser le JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes publiques
app.use('/api/auth', authRoutes);

// Routes protégées
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/parking', parkingRoutes);
app.use('/api/reservations', authenticateToken, reservationRoutes);
app.use('/api/payments', authenticateToken, paymentRoutes);
app.use('/api/balance', authenticateToken, balanceRoutes);
app.use('/api/favorites', authenticateToken, favoriteRoutes);

// Route de santé de l'API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Parky API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Route racine
app.get('/', (req, res) => {
  res.json({
    message: 'Bienvenue sur l\'API Parky',
    version: '1.0.0',
    documentation: '/api/docs'
  });
});

// Middleware de gestion d'erreurs
app.use(errorHandler);

// Gestion des routes non trouvées
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route non trouvée',
    message: `La route ${req.originalUrl} n'existe pas`
  });
});

// Démarrage du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur Parky démarré sur le port ${PORT}`);
  console.log(`📱 API disponible localement: http://localhost:${PORT}/api`);
  console.log(`🌐 API disponible sur le réseau: http://192.168.100.12:${PORT}/api`);
  console.log(`🔍 Santé de l'API (local): http://localhost:${PORT}/api/health`);
  console.log(`🔍 Santé de l'API (réseau): http://192.168.100.12:${PORT}/api/health`);
});

module.exports = app; 