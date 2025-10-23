// Initialiser Firebase Admin SDK
const firebaseService = require('./services/firebaseService');
firebaseService.initialize().catch(console.error);

const notificationsRoutes = require('./routes/notifications');
app.use('/api/notifications', authenticateToken, notificationsRoutes);