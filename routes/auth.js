const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const emailService = require('../services/emailService');
const googleAuthService = require('../services/googleAuthService');
const facebookAuthService = require('../services/facebookAuthService');

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

    // Générer un code de réinitialisation à 6 chiffres
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Sauvegarder le code en base
    await executeQuery(
      'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
      [resetCode, resetTokenExpiry, user[0].id]
    );

    // Envoyer l'email avec le code de réinitialisation
    try {
      await emailService.sendPasswordResetCode(user[0].email, {
        userName: user[0].first_name,
        resetCode: resetCode
      });
      console.log('✅ Email de réinitialisation envoyé');
    } catch (emailError) {
      console.error('❌ Erreur envoi email de réinitialisation:', emailError.message);
      // Continuer même si l'email échoue
    }

    res.json({
      message: 'Si un compte avec cette adresse email existe, un code de réinitialisation a été envoyé'
    });

  } catch (error) {
    next(error);
  }
});

// Route de réinitialisation de mot de passe avec token
router.post('/reset-password', [
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code à 6 chiffres requis'),
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

    const { code, password } = req.body;

    // Vérifier le code de réinitialisation
    const user = await executeQuery(
      'SELECT id, email, first_name FROM users WHERE reset_token = ? AND reset_token_expiry > NOW() AND status = "active"',
      [code]
    );

    if (user.length === 0) {
      return res.status(400).json({
        error: 'Code invalide',
        message: 'Le code de réinitialisation est invalide ou a expiré'
      });
    }

    // Hasher le nouveau mot de passe
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Mettre à jour le mot de passe et supprimer le code
    await executeQuery(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
      [hashedPassword, user[0].id]
    );

    console.log(`✅ Mot de passe réinitialisé pour l'utilisateur ${user[0].email}`);

    res.json({
      message: 'Mot de passe réinitialisé avec succès'
    });

  } catch (error) {
    next(error);
  }
});

// Route d'authentification Google
router.post('/google', [
  body('idToken').notEmpty().withMessage('Token Google requis')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Token Google requis',
        details: errors.array()
      });
    }

    const { idToken } = req.body;

    // Vérifier le token Google
    const googleData = await googleAuthService.verifyGoogleToken(idToken);

    // Créer ou récupérer l'utilisateur
    const user = await googleAuthService.findOrCreateGoogleUser(googleData, executeQuery);

    // Générer la réponse avec token JWT
    const authResponse = googleAuthService.generateAuthResponse(user, generateToken);

    res.json(authResponse);

  } catch (error) {
    console.error('❌ Erreur authentification Google:', error.message);

    if (error.message === 'Token Google invalide') {
      return res.status(401).json({
        error: 'Token invalide',
        message: 'Le token Google fourni est invalide ou expiré'
      });
    }

    if (error.message === 'Service Google Auth non configuré') {
      return res.status(503).json({
        error: 'Service indisponible',
        message: 'L\'authentification Google n\'est pas configurée sur ce serveur'
      });
    }

    next(error);
  }
});

// Route d'authentification Facebook
router.post('/facebook', [
  body('facebook_token').notEmpty().withMessage('Token Facebook requis'),
  body('facebook_id').notEmpty().withMessage('ID Facebook requis'),
  body('email').optional({ nullable: true, checkFalsy: false }).custom((value) => {
    if (value === null || value === undefined || value === '') {
      return true; // Allow null/undefined/empty
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error('Email invalide');
    }
    return true;
  }),
  body('first_name').optional().trim().isLength({ min: 1 }).withMessage('Prénom invalide'),
  body('last_name').optional().trim().isLength({ min: 1 }).withMessage('Nom invalide')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Token Facebook requis',
        details: errors.array()
      });
    }

    const { facebook_token, facebook_id, email, first_name, last_name, profile_picture_url } = req.body;

    // Vérifier le token Facebook
    const facebookData = await facebookAuthService.verifyFacebookToken(facebook_token);

    // Vérifier que l'ID Facebook correspond
    if (facebookData.facebook_id !== facebook_id) {
      return res.status(401).json({
        error: 'Token invalide',
        message: 'L\'ID Facebook ne correspond pas au token fourni'
      });
    }

    // Utiliser les données du front-end si disponibles, sinon celles de Facebook
    const userData = {
      facebook_id: facebook_id,
      name: `${first_name || ''} ${last_name || ''}`.trim() || facebookData.name,
      email: email || facebookData.email,
      picture_url: profile_picture_url || facebookData.picture_url
    };

    // Créer ou récupérer l'utilisateur
    const user = await facebookAuthService.findOrCreateFacebookUser(userData, executeQuery);

    // Générer la réponse avec token JWT
    const authResponse = facebookAuthService.generateAuthResponse(user, generateToken);

    res.json(authResponse);

  } catch (error) {
    console.error('❌ Erreur authentification Facebook complète:', error);
    console.error('❌ Stack trace:', error.stack);

    if (error.message === 'Token Facebook invalide') {
      return res.status(401).json({
        error: 'Token invalide',
        message: 'Le token Facebook fourni est invalide ou expiré'
      });
    }

    if (error.message.includes('validation')) {
      return res.status(400).json({
        error: 'Validation échouée',
        message: error.message
      });
    }

    if (error.message.includes('création de l\'utilisateur')) {
      return res.status(500).json({
        error: 'Erreur base de données',
        message: 'Erreur lors de la création de l\'utilisateur Facebook',
        details: error.message
      });
    }

    next(error);
  }
});

// Route d'authentification Facebook - VERSION ROBUSTE
router.post('/facebook-robust', [
  body('facebook_token').notEmpty().withMessage('Token Facebook requis'),
  body('facebook_id').notEmpty().withMessage('ID Facebook requis'),
  body('first_name').optional().trim(),
  body('last_name').optional().trim()
], async (req, res, next) => {
  try {
    console.log('🚀 Début authentification Facebook robuste');
    console.log('📥 Données reçues:', {
      facebook_id: req.body.facebook_id,
      facebook_token: req.body.facebook_token ? '[TOKEN_PRESENT]' : '[NO_TOKEN]',
      first_name: req.body.first_name,
      last_name: req.body.last_name
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Erreurs de validation:', errors.array());
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Données requises manquantes',
        details: errors.array()
      });
    }

    const { facebook_token, facebook_id, first_name, last_name, profile_picture_url } = req.body;

    // Vérifier le token Facebook
    console.log('🔐 Vérification token Facebook...');
    const facebookData = await facebookAuthService.verifyFacebookToken(facebook_token);

    // Vérifier que l'ID Facebook correspond
    if (facebookData.facebook_id !== facebook_id) {
      console.log('❌ ID Facebook ne correspond pas:', {
        received: facebook_id,
        fromToken: facebookData.facebook_id
      });
      return res.status(401).json({
        error: 'Token invalide',
        message: 'L\'ID Facebook ne correspond pas au token fourni'
      });
    }

    console.log('✅ Token Facebook validé avec succès');

    // Utiliser les données du front-end si disponibles, sinon celles de Facebook
    const userData = {
      facebook_id: facebook_id,
      name: `${first_name || ''} ${last_name || ''}`.trim() || facebookData.name,
      email: null, // Pas d'email pour éviter les problèmes
      picture_url: profile_picture_url || facebookData.picture_url
    };

    console.log('👤 Données utilisateur préparées:', userData);

    // Créer ou récupérer l'utilisateur
    console.log('🔍 Recherche/création utilisateur...');
    const user = await facebookAuthService.findOrCreateFacebookUser(userData, executeQuery);

    console.log('✅ Utilisateur obtenu:', {
      id: user.id,
      email: user.email,
      facebook_id: user.facebook_id
    });

    // Générer la réponse avec token JWT
    const authResponse = facebookAuthService.generateAuthResponse(user, generateToken);

    console.log('🎉 Authentification Facebook robuste réussie');
    res.json(authResponse);

  } catch (error) {
    console.error('❌ ERREUR COMPLETE authentification Facebook robuste:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);

    if (error.message === 'Token Facebook invalide') {
      return res.status(401).json({
        error: 'Token invalide',
        message: 'Le token Facebook fourni est invalide ou expiré'
      });
    }

    if (error.message.includes('Impossible de créer l\'utilisateur')) {
      return res.status(500).json({
        error: 'Erreur création utilisateur',
        message: 'Impossible de créer l\'utilisateur Facebook après plusieurs tentatives',
        details: error.message
      });
    }

    // Erreur générique
    return res.status(500).json({
      error: 'Erreur serveur',
      message: 'Erreur interne du serveur lors de l\'authentification Facebook',
      details: error.message
    });
  }
});

// Route de déconnexion (optionnelle, car JWT est stateless)
router.post('/logout', (req, res) => {
  res.json({
    message: 'Déconnexion réussie'
  });
});

module.exports = router; 