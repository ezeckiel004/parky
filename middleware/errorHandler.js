// Middleware de gestion d'erreurs global
const errorHandler = (err, req, res, next) => {
  console.error('Erreur:', err);

  // Erreurs de validation
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Erreur de validation',
      message: err.message,
      details: err.details
    });
  }

  // Erreurs de base de données
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: 'Conflit de données',
      message: 'Une ressource avec ces informations existe déjà'
    });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      error: 'Référence invalide',
      message: 'La référence fournie n\'existe pas'
    });
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(400).json({
      error: 'Suppression impossible',
      message: 'Cette ressource ne peut pas être supprimée car elle est utilisée ailleurs'
    });
  }

  // Erreurs de syntaxe SQL
  if (err.code === 'ER_PARSE_ERROR') {
    return res.status(500).json({
      error: 'Erreur de base de données',
      message: 'Erreur lors de l\'exécution de la requête'
    });
  }

  // Erreurs de connexion à la base de données
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return res.status(503).json({
      error: 'Service indisponible',
      message: 'Le service de base de données est temporairement indisponible'
    });
  }

  // Erreurs de fichiers
  if (err.code === 'ENOENT') {
    return res.status(404).json({
      error: 'Fichier non trouvé',
      message: 'Le fichier demandé n\'existe pas'
    });
  }

  // Erreurs de limite de taille
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'Fichier trop volumineux',
      message: 'La taille du fichier dépasse la limite autorisée'
    });
  }

  // Erreurs de type de fichier
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Type de fichier non autorisé',
      message: 'Le type de fichier n\'est pas supporté'
    });
  }

  // Erreurs JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Token invalide',
      message: 'Le token d\'authentification est invalide'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expiré',
      message: 'Le token d\'authentification a expiré'
    });
  }

  // Erreurs de validation express-validator
  if (err.type === 'validation') {
    return res.status(400).json({
      error: 'Données invalides',
      message: 'Les données fournies ne sont pas valides',
      details: err.details
    });
  }

  // Erreur par défaut
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Une erreur interne s\'est produite';

  res.status(statusCode).json({
    error: 'Erreur serveur',
    message: process.env.NODE_ENV === 'production' 
      ? 'Une erreur s\'est produite' 
      : message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Classe d'erreur personnalisée
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Fonction pour créer des erreurs avec des messages personnalisés
const createError = (message, statusCode = 500) => {
  return new AppError(message, statusCode);
};

module.exports = {
  errorHandler,
  AppError,
  createError
}; 