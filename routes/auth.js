const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// Validation pour l'inscription
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Adresse email invalide'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  body('firstName')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Le prénom doit contenir au moins 2 caractères'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Le nom doit contenir au moins 2 caractères'),
  body('phone')
    .optional()
    .matches(/^[+]?[\d\s\-\(\)]+$/)
    .withMessage('Numéro de téléphone invalide'),
  body('role')
    .optional()
    .isIn(['client', 'proprietaire', 'admin'])
    .withMessage('Rôle invalide')
];

// Validation pour la connexion
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Adresse email invalide'),
  body('password')
    .notEmpty()
    .withMessage('Mot de passe requis')
];

// Route d'inscription
router.post('/register', registerValidation, async (req, res, next) => {
  try {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const { email, password, firstName, lastName, phone, role = 'client' } = req.body;

    console.log('=== DEBUG INSCRIPTION BACKEND ===');
    console.log('Data reçue:', { email, firstName, lastName, phone, role });
    console.log('Phone type:', typeof phone, 'Value:', phone);

    // Normaliser les valeurs undefined en null pour MySQL
    const normalizedPhone = phone === undefined ? null : phone;
    const normalizedLastName = lastName === undefined ? null : lastName;

    console.log('Normalized values:', { normalizedPhone, normalizedLastName });

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await executeQuery(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        error: 'Utilisateur existant',
        message: 'Un compte avec cette adresse email existe déjà'
      });
    }

    // Hasher le mot de passe
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insérer le nouvel utilisateur avec les valeurs normalisées
    const result = await executeQuery(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [email, hashedPassword, firstName, normalizedLastName, normalizedPhone, role]
    );

    const userId = result.insertId;

    // Générer le token JWT
    const token = generateToken(userId, email, role);

    // Récupérer les informations utilisateur (sans le mot de passe)
    const user = await executeQuery(
      'SELECT id, email, first_name, last_name, phone, role, status, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.status(201).json({
      message: 'Compte créé avec succès',
      user: user[0],
      token
    });

  } catch (error) {
    next(error);
  }
});

// Route de connexion
router.post('/login', loginValidation, async (req, res, next) => {
  try {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Récupérer l'utilisateur
    const users = await executeQuery(
      'SELECT * FROM users WHERE email = ? AND status = "active"',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: 'Identifiants invalides',
        message: 'Email ou mot de passe incorrect'
      });
    }

    const user = users[0];

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Identifiants invalides',
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Générer le token JWT
    const token = generateToken(user.id, user.email, user.role);

    // Mettre à jour la dernière connexion
    await executeQuery(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    // Retourner les informations utilisateur (sans le mot de passe)
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Connexion réussie',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    next(error);
  }
});

// Route de vérification du token
router.get('/verify', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        error: 'Token manquant',
        message: 'Token d\'authentification requis'
      });
    }

    // Le middleware authenticateToken sera appelé automatiquement
    // Cette route est protégée par le middleware
    res.json({
      message: 'Token valide',
      user: req.user
    });

  } catch (error) {
    next(error);
  }
});

// Route de réinitialisation de mot de passe
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Adresse email invalide')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const { email } = req.body;

    // Vérifier si l'utilisateur existe
    const user = await executeQuery(
      'SELECT id, email, first_name FROM users WHERE email = ? AND status = "active"',
      [email]
    );

    if (user.length === 0) {
      // Pour des raisons de sécurité, ne pas révéler si l'email existe ou non
      return res.json({
        message: 'Si un compte avec cette adresse email existe, un email de réinitialisation a été envoyé'
      });
    }

    // Générer un token de réinitialisation (expire dans 1 heure)
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

    // Sauvegarder le token en base
    await executeQuery(
      'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
      [resetToken, resetTokenExpiry, user[0].id]
    );

    // TODO: Envoyer l'email de réinitialisation
    // Pour l'instant, on retourne juste un message de succès
    res.json({
      message: 'Si un compte avec cette adresse email existe, un email de réinitialisation a été envoyé'
    });

  } catch (error) {
    next(error);
  }
});

// Route de réinitialisation de mot de passe avec token
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token requis'),
  body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const { token, password } = req.body;

    // Vérifier le token
    const user = await executeQuery(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expiry > NOW() AND status = "active"',
      [token]
    );

    if (user.length === 0) {
      return res.status(400).json({
        error: 'Token invalide',
        message: 'Le token de réinitialisation est invalide ou a expiré'
      });
    }

    // Hasher le nouveau mot de passe
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Mettre à jour le mot de passe et supprimer le token
    await executeQuery(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
      [hashedPassword, user[0].id]
    );

    res.json({
      message: 'Mot de passe réinitialisé avec succès'
    });

  } catch (error) {
    next(error);
  }
});

// Route de déconnexion (optionnelle, car JWT est stateless)
router.post('/logout', (req, res) => {
  res.json({
    message: 'Déconnexion réussie'
  });
});

module.exports = router; 