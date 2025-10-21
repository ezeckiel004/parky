const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');

// Middleware pour vérifier le token JWT
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Token d\'accès requis',
        message: 'Veuillez fournir un token d\'authentification'
      });
    }

    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Vérifier si l'utilisateur existe toujours en base
    const user = await executeQuery(
      'SELECT id, email, role, status FROM users WHERE id = ? AND status = "active"',
      [decoded.userId]
    );

    if (user.length === 0) {
      return res.status(401).json({
        error: 'Token invalide',
        message: 'Utilisateur non trouvé ou compte désactivé'
      });
    }

    // Ajouter les informations utilisateur à la requête
    req.user = user[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token invalide',
        message: 'Le token d\'authentification est invalide'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expiré',
        message: 'Le token d\'authentification a expiré'
      });
    } else {
      console.error('Erreur d\'authentification:', error);
      return res.status(500).json({
        error: 'Erreur serveur',
        message: 'Erreur lors de la vérification du token'
      });
    }
  }
};

// Middleware pour vérifier les rôles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Non autorisé',
        message: 'Token d\'authentification requis'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'Vous n\'avez pas les permissions nécessaires pour cette action'
      });
    }

    next();
  };
};

// Middleware pour vérifier si l'utilisateur est propriétaire de la ressource
const authorizeOwner = (resourceTable, resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id || req.body[resourceIdField];
      
      if (!resourceId) {
        return res.status(400).json({
          error: 'ID de ressource requis',
          message: 'L\'identifiant de la ressource est requis'
        });
      }

      // Vérifier si l'utilisateur est propriétaire de la ressource
      const resource = await executeQuery(
        `SELECT user_id FROM ${resourceTable} WHERE ${resourceIdField} = ?`,
        [resourceId]
      );

      if (resource.length === 0) {
        return res.status(404).json({
          error: 'Ressource non trouvée',
          message: 'La ressource demandée n\'existe pas'
        });
      }

      if (resource[0].user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Accès refusé',
          message: 'Vous n\'êtes pas autorisé à accéder à cette ressource'
        });
      }

      next();
    } catch (error) {
      console.error('Erreur lors de la vérification de propriété:', error);
      return res.status(500).json({
        error: 'Erreur serveur',
        message: 'Erreur lors de la vérification des permissions'
      });
    }
  };
};

// Générer un token JWT
const generateToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizeOwner,
  generateToken
}; 