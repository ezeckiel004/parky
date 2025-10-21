const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authorizeRoles } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// Validation pour la mise à jour du profil
const updateProfileValidation = [
  body('firstName')
    .optional()
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
  body('address')
    .optional()
    .trim()
    .isLength({ min: 10 })
    .withMessage('L\'adresse doit contenir au moins 10 caractères')
];

// Validation pour le changement de mot de passe
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Mot de passe actuel requis'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 6 caractères')
];

// Route pour récupérer le profil de l'utilisateur connecté
router.get('/profile', async (req, res, next) => {
  try {
    const user = await executeQuery(
      `SELECT id, email, first_name, last_name, phone, address, role, status, 
              created_at, last_login, profile_image 
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (user.length === 0) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé',
        message: 'L\'utilisateur demandé n\'existe pas'
      });
    }

    res.json({
      user: user[0]
    });

  } catch (error) {
    next(error);
  }
});

// Route pour mettre à jour le profil
router.put('/profile', updateProfileValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const { firstName, lastName, phone, address } = req.body;

    // Construire la requête de mise à jour dynamiquement
    const updateFields = [];
    const updateValues = [];

    if (firstName) {
      updateFields.push('first_name = ?');
      updateValues.push(firstName);
    }
    if (lastName) {
      updateFields.push('last_name = ?');
      updateValues.push(lastName);
    }
    if (phone) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (address) {
      updateFields.push('address = ?');
      updateValues.push(address);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'Aucune donnée à mettre à jour',
        message: 'Veuillez fournir au moins un champ à mettre à jour'
      });
    }

    updateValues.push(req.user.id);

    const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
    await executeQuery(query, updateValues);

    // Récupérer les informations mises à jour
    const updatedUser = await executeQuery(
      `SELECT id, email, first_name, last_name, phone, address, role, status, 
              created_at, last_login, profile_image 
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    res.json({
      message: 'Profil mis à jour avec succès',
      user: updatedUser[0]
    });

  } catch (error) {
    next(error);
  }
});

// Route pour changer le mot de passe
router.put('/change-password', changePasswordValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Récupérer le mot de passe actuel
    const user = await executeQuery(
      'SELECT password FROM users WHERE id = ?',
      [req.user.id]
    );

    if (user.length === 0) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé',
        message: 'L\'utilisateur demandé n\'existe pas'
      });
    }

    // Vérifier le mot de passe actuel
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user[0].password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        error: 'Mot de passe incorrect',
        message: 'Le mot de passe actuel est incorrect'
      });
    }

    // Hasher le nouveau mot de passe
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Mettre à jour le mot de passe
    await executeQuery(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedNewPassword, req.user.id]
    );

    res.json({
      message: 'Mot de passe modifié avec succès'
    });

  } catch (error) {
    next(error);
  }
});

// Route pour supprimer le compte (admin seulement)
router.delete('/:id', authorizeRoles('admin'), async (req, res, next) => {
  try {
    const userId = req.params.id;

    // Vérifier si l'utilisateur existe
    const user = await executeQuery(
      'SELECT id, role FROM users WHERE id = ?',
      [userId]
    );

    if (user.length === 0) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé',
        message: 'L\'utilisateur demandé n\'existe pas'
      });
    }

    // Empêcher la suppression d'un admin par un autre admin
    if (user[0].role === 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        error: 'Action non autorisée',
        message: 'Vous ne pouvez pas supprimer un autre administrateur'
      });
    }

    // Supprimer l'utilisateur (soft delete)
    await executeQuery(
      'UPDATE users SET status = "deleted", deleted_at = NOW() WHERE id = ?',
      [userId]
    );

    res.json({
      message: 'Utilisateur supprimé avec succès'
    });

  } catch (error) {
    next(error);
  }
});

// Route pour récupérer tous les utilisateurs (admin seulement)
// Route pour récupérer tous les utilisateurs (admin seulement)
router.get('/', authorizeRoles('admin'), async (req, res, next) => {
  try {
    let { page = 1, limit = 10, role, status } = req.query;

    // Convertir proprement en nombres
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const offset = (page - 1) * limit;

    // Construire la requête avec filtres
    let query = `
      SELECT id, email, first_name, last_name, phone, role, status, 
             created_at, last_login 
      FROM users 
      WHERE status != 'deleted'
    `;
    const queryParams = [];

    if (role) {
      query += ' AND role = ?';
      queryParams.push(role);
    }

    if (status) {
      query += ' AND status = ?';
      queryParams.push(status);
    }

    // ✅ Concaténer LIMIT et OFFSET directement
    query += ` ORDER BY created_at DESC LIMIT ${offset}, ${limit}`;

    const users = await executeQuery(query, queryParams);

    // Compter le total d'utilisateurs
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE status != "deleted"';
    const countParams = [];

    if (role) {
      countQuery += ' AND role = ?';
      countParams.push(role);
    }

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("ERREUR SERVEUR USERS:", error);
    next(error);
  }
});


// Route pour récupérer un utilisateur spécifique (admin seulement)
router.get('/:id', authorizeRoles('admin'), async (req, res, next) => {
  try {
    const userId = req.params.id;

    const user = await executeQuery(
      `SELECT id, email, first_name, last_name, phone, address, role, status, 
              created_at, last_login, profile_image 
       FROM users WHERE id = ? AND status != 'deleted'`,
      [userId]
    );

    if (user.length === 0) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé',
        message: 'L\'utilisateur demandé n\'existe pas'
      });
    }

    res.json({
      user: user[0]
    });

  } catch (error) {
    next(error);
  }
});

// Route pour activer/désactiver un utilisateur (admin seulement)
router.patch('/:id/status', authorizeRoles('admin'), [
  body('status').isIn(['active', 'inactive']).withMessage('Statut invalide')
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

    const userId = req.params.id;
    const { status } = req.body;

    // Vérifier si l'utilisateur existe
    const user = await executeQuery(
      'SELECT id, role FROM users WHERE id = ? AND status != "deleted"',
      [userId]
    );

    if (user.length === 0) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé',
        message: 'L\'utilisateur demandé n\'existe pas'
      });
    }

    // Empêcher la désactivation d'un admin par un autre admin
    if (user[0].role === 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        error: 'Action non autorisée',
        message: 'Vous ne pouvez pas modifier le statut d\'un autre administrateur'
      });
    }

    // Mettre à jour le statut
    await executeQuery(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, userId]
    );

    res.json({
      message: `Utilisateur ${status === 'active' ? 'activé' : 'désactivé'} avec succès`
    });

  } catch (error) {
    next(error);
  }
});

router.get('/admin/stats', authorizeRoles('admin'), async (req, res, next) => {
  try {
    // Nombre d'utilisateurs (excluant deleted)
    const usersCount = await executeQuery(
      'SELECT COUNT(*) as count FROM users WHERE status != "deleted"'
    );
    const totalUsers = usersCount[0].count;

    // Nombre de parkings (assumant tous, ou ajuster si filtre nécessaire)
    const parkingsCount = await executeQuery(
      'SELECT COUNT(*) as count FROM parkings'
    );
    const totalParkings = parkingsCount[0].count;

    // Nombre de reservations
    const reservationsCount = await executeQuery(
      'SELECT COUNT(*) as count FROM reservations'
    );
    const totalReservations = reservationsCount[0].count;

    // Nombre de payments
    const paymentsCount = await executeQuery(
      'SELECT COUNT(*) as count FROM payments'
    );
    const totalPayments = paymentsCount[0].count;

    // Calcul des revenus depuis owner_balances
    const balancesSum = await executeQuery(
      'SELECT SUM(total_earned) as totalEarned FROM owner_balances'
    );
    const ownersTotalEarned = parseFloat(balancesSum[0].totalEarned) || 0;
    const commissionRate = 0.15;
    const grossRevenue = ownersTotalEarned / (1 - commissionRate);
    const appCommission = grossRevenue * commissionRate;

    res.json({
      stats: {
        totalUsers,
        totalParkings,
        totalReservations,
        totalPayments,
        grossRevenue: grossRevenue.toFixed(2),
        appCommission: appCommission.toFixed(2),
        ownersEarned: ownersTotalEarned.toFixed(2)
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router; 
