const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();

// Middleware d'authentification pour toutes les routes
router.use(authenticateToken);

/**
 * Enregistrer/Mettre à jour le FCM token de l'utilisateur
 */
router.put('/fcm-token', [
  body('fcmToken').notEmpty().withMessage('FCM token requis')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const { fcmToken } = req.body;
    const userId = req.user.id;

    await executeQuery(
      'UPDATE users SET fcm_token = ? WHERE id = ?',
      [fcmToken, userId]
    );

    res.json({
      message: 'FCM token mis à jour avec succès'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * Récupérer les notifications de l'utilisateur
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const result = await notificationService.getUserNotifications(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true'
    });

    res.json(result);

  } catch (error) {
    next(error);
  }
});

/**
 * Marquer une notification comme lue
 */
router.put('/:notificationId/read', async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    await notificationService.markAsRead(notificationId, userId);

    res.json({
      message: 'Notification marquée comme lue'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * Marquer toutes les notifications comme lues
 */
router.put('/mark-all-read', async (req, res, next) => {
  try {
    const userId = req.user.id;

    await notificationService.markAllAsRead(userId);

    res.json({
      message: 'Toutes les notifications marquées comme lues'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * Récupérer les paramètres de notification de l'utilisateur
 */
router.get('/settings', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const settings = await executeQuery(
      'SELECT * FROM notification_settings WHERE user_id = ?',
      [userId]
    );

    if (settings.length === 0) {
      // Créer des paramètres par défaut
      await executeQuery(
        'INSERT INTO notification_settings (user_id) VALUES (?)',
        [userId]
      );

      const defaultSettings = await executeQuery(
        'SELECT * FROM notification_settings WHERE user_id = ?',
        [userId]
      );

      return res.json(defaultSettings[0]);
    }

    res.json(settings[0]);

  } catch (error) {
    next(error);
  }
});

/**
 * Mettre à jour les paramètres de notification
 */
router.put('/settings', [
  body('push_enabled').optional().isBoolean(),
  body('email_enabled').optional().isBoolean(),
  body('reservation_notifications').optional().isBoolean(),
  body('payment_notifications').optional().isBoolean(),
  body('marketing_notifications').optional().isBoolean()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const {
      push_enabled,
      email_enabled,
      reservation_notifications,
      payment_notifications,
      marketing_notifications
    } = req.body;

    const updateFields = [];
    const updateValues = [];

    if (push_enabled !== undefined) {
      updateFields.push('push_enabled = ?');
      updateValues.push(push_enabled);
    }
    if (email_enabled !== undefined) {
      updateFields.push('email_enabled = ?');
      updateValues.push(email_enabled);
    }
    if (reservation_notifications !== undefined) {
      updateFields.push('reservation_notifications = ?');
      updateValues.push(reservation_notifications);
    }
    if (payment_notifications !== undefined) {
      updateFields.push('payment_notifications = ?');
      updateValues.push(payment_notifications);
    }
    if (marketing_notifications !== undefined) {
      updateFields.push('marketing_notifications = ?');
      updateValues.push(marketing_notifications);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'Aucune donnée à mettre à jour'
      });
    }

    updateValues.push(userId);

    await executeQuery(
      `UPDATE notification_settings SET ${updateFields.join(', ')} WHERE user_id = ?`,
      updateValues
    );

    res.json({
      message: 'Paramètres de notification mis à jour'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * Envoyer une notification de test (dev seulement)
 */
router.post('/test', [
  body('title').notEmpty().withMessage('Titre requis'),
  body('body').notEmpty().withMessage('Corps requis')
], async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Endpoint de test non disponible en production'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const { title, body } = req.body;
    const userId = req.user.id;

    await notificationService.sendNotification({
      userId,
      title,
      body,
      type: 'TEST',
      data: { test: true }
    });

    res.json({
      message: 'Notification de test envoyée'
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;