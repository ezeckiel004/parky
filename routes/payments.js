const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const StripeService = require('../services/stripeService');
const stripe = require('../config/stripe');

const router = express.Router();

// Validation pour la création d'un paiement
const paymentValidation = [
  body('reservationId')
    .isInt({ min: 1 })
    .withMessage('ID de réservation invalide'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Montant invalide'),
  body('paymentMethod')
    .isIn(['card', 'cash', 'mobile_payment'])
    .withMessage('Méthode de paiement invalide')
];

// Route pour créer un Payment Intent Stripe
// Dans votre route
// Dans la route /create-payment-intent
router.post('/create-payment-intent', async (req, res, next) => {
  try {
    const { reservationId, amount } = req.body;

    console.log('=== DEBUG PAYMENT INTENT ===');
    console.log('reservationId reçu:', reservationId);
    console.log('amount reçu:', amount);
    console.log('user.id:', req.user.id);

    // D'abord, chercher la réservation sans filtre de statut pour debug
    const reservationDebug = await executeQuery(
      `SELECT r.*, u.first_name, u.last_name 
       FROM reservations r 
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = ?`,
      [reservationId]
    );

    console.log('Réservation trouvée (debug):', reservationDebug);

    // Récupérer le total_amount de la réservation
    const reservation = await executeQuery(
      `SELECT r.total_amount, r.status 
       FROM reservations r 
       WHERE r.id = ? AND r.user_id = ? AND r.status IN ('pending', 'confirmed')`,
      [reservationId, req.user.id]
    );

    console.log('Réservation filtrée:', reservation);

    if (reservation.length === 0) {
      console.log('❌ Réservation non trouvée avec les critères');
      return res.status(404).json({
        error: 'Réservation non trouvée ou non payable'
      });
    }

    const dbAmount = reservation[0].total_amount;
    // Vérifier que le montant frontend correspond au montant DB
    if (Math.abs(amount - dbAmount) > 0.01) {
      console.log(`⚠️ Incohérence montant: DB=${dbAmount}€, Frontend=${amount}€`);
      // Utiliser le montant de la DB pour la sécurité
      amount = dbAmount;
    }

    console.log(`Utilisation montant: ${amount}€ (source: ${Math.abs(amount - dbAmount) > 0.01 ? 'DB' : 'Frontend'})`);

    // Créer PaymentIntent avec le montant validé
    const paymentIntent = await StripeService.createPaymentIntent(
      reservationId,
      req.user,
      amount // Montant validé
    );

    res.json({
      message: 'Payment Intent créé',
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amount // Retourner le montant utilisé
    });

  } catch (error) {
    next(error);
  }
});

// Route pour confirmer un paiement Stripe
router.post('/confirm-payment', [
  body('paymentIntentId')
    .notEmpty()
    .withMessage('Payment Intent ID requis')
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

    const { paymentIntentId } = req.body;

    // Confirmer le paiement avec Stripe
    const paymentId = await StripeService.confirmPayment(paymentIntentId);

    // Récupérer le paiement créé
    const payment = await executeQuery(
      `SELECT p.*, r.start_time, r.end_time, ps.space_number, park.name as parking_name
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN parking_spaces ps ON r.space_id = ps.id
       JOIN parkings park ON ps.parking_id = park.id
       WHERE p.id = ?`,
      [paymentId]
    );

    res.json({
      message: 'Paiement confirmé avec succès',
      payment: payment[0]
    });

  } catch (error) {
    next(error);
  }
});

// Route pour créer une session Checkout Stripe
router.post('/create-checkout-session', [
  body('reservationId')
    .isInt({ min: 1 })
    .withMessage('ID de réservation invalide'),
  body('successUrl')
    .optional()
    .isURL()
    .withMessage('URL de succès invalide'),
  body('cancelUrl')
    .optional()
    .isURL()
    .withMessage('URL d\'annulation invalide')
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

    const { reservationId, successUrl, cancelUrl } = req.body;

    // Vérifier la réservation
    const reservation = await executeQuery(
      'SELECT * FROM reservations WHERE id = ? AND user_id = ? AND status IN ("pending", "active")',
      [reservationId, req.user.id]
    );

    if (reservation.length === 0) {
      return res.status(404).json({
        error: 'Réservation non trouvée',
        message: 'La réservation demandée n\'existe pas ou n\'est pas payable'
      });
    }

    // Créer la session Checkout avec URLs frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const session = await StripeService.createCheckoutSession(
      reservationId,
      req.user,
      successUrl || `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl || `${frontendUrl}/payment/cancel?session_id={CHECKOUT_SESSION_ID}`
    );

    console.log('Session URL complète:', session.url);

    res.json({
      message: 'Session Checkout créée avec succès',
      sessionId: session.id,
      url: session.url,
      urlLength: session.url.length
    });

  } catch (error) {
    next(error);
  }
});

// Route pour vérifier le statut d'une session Stripe
router.get('/session-status/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    // Récupérer la session Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Vérifier que la session appartient à l'utilisateur connecté
    if (session.metadata.user_id !== req.user.id.toString()) {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'Cette session ne vous appartient pas'
      });
    }

    // Récupérer les détails de la réservation
    const reservationId = parseInt(session.metadata.reservation_id);
    const reservation = await executeQuery(
      'SELECT status, paid_at FROM reservations WHERE id = ?',
      [reservationId]
    );

    res.json({
      sessionId: session.id,
      paymentStatus: session.payment_status, // "paid", "unpaid", "no_payment_required"
      sessionStatus: session.status, // "open", "complete", "expired"
      reservationId: reservationId,
      reservationStatus: reservation[0]?.status || 'not_found',
      paidAt: reservation[0]?.paid_at || null,
      amount: session.amount_total / 100,
      currency: session.currency
    });

  } catch (error) {
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(404).json({
        error: 'Session non trouvée',
        message: 'La session de paiement demandée n\'existe pas'
      });
    }
    next(error);
  }
});

// Fonction pour simuler le traitement du paiement
async function processPayment(method, amount, cardDetails) {
  // Simulation d'un délai de traitement
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Simulation de différents scénarios
  const random = Math.random();
  
  if (random < 0.95) {
    // 95% de succès
    return {
      status: 'completed',
      transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  } else {
    // 5% d'échec
    return {
      status: 'failed',
      transactionId: null
    };
  }
}

// Route pour récupérer les paiements de l'utilisateur
router.get('/my-payments', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT p.*, r.start_time, r.end_time, ps.space_number, park.name as parking_name
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN parking_spaces ps ON r.space_id = ps.id
      JOIN parkings park ON ps.parking_id = park.id
      WHERE p.user_id = ?
    `;
    const queryParams = [req.user.id];

    if (status) {
      query += ' AND p.status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), offset);

    const payments = await executeQuery(query, queryParams);

    // Compter le total
    let countQuery = 'SELECT COUNT(*) as total FROM payments WHERE user_id = ?';
    const countParams = [req.user.id];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;

    res.json({
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// Route pour récupérer un paiement spécifique
router.get('/:id', async (req, res, next) => {
  try {
    const paymentId = req.params.id;

    const payment = await executeQuery(
      `SELECT p.*, r.start_time, r.end_time, ps.space_number, park.name as parking_name
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN parking_spaces ps ON r.space_id = ps.id
       JOIN parkings park ON ps.parking_id = park.id
       WHERE p.id = ? AND p.user_id = ?`,
      [paymentId, req.user.id]
    );

    if (payment.length === 0) {
      return res.status(404).json({
        error: 'Paiement non trouvé',
        message: 'Le paiement demandé n\'existe pas'
      });
    }

    res.json({
      payment: payment[0]
    });

  } catch (error) {
    next(error);
  }
});

// Route pour récupérer les paiements d'un parking (propriétaire)
router.get('/parking/:parkingId', async (req, res, next) => {
  try {
    const parkingId = req.params.parkingId;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Vérifier que l'utilisateur est propriétaire du parking
    const parking = await executeQuery(
      'SELECT owner_id FROM parkings WHERE id = ?',
      [parkingId]
    );

    if (parking.length === 0) {
      return res.status(404).json({
        error: 'Parking non trouvé',
        message: 'Le parking demandé n\'existe pas'
      });
    }

    if (parking[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'Vous n\'êtes pas autorisé à voir les paiements de ce parking'
      });
    }

    let query = `
      SELECT p.*, r.start_time, r.end_time, ps.space_number, u.first_name, u.last_name, u.email
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN parking_spaces ps ON r.space_id = ps.id
      JOIN users u ON p.user_id = u.id
      WHERE ps.parking_id = ?
    `;
    const queryParams = [parkingId];

    if (status) {
      query += ' AND p.status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), offset);

    const payments = await executeQuery(query, queryParams);

    // Compter le total
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN parking_spaces ps ON r.space_id = ps.id
      WHERE ps.parking_id = ?
    `;
    const countParams = [parkingId];

    if (status) {
      countQuery += ' AND p.status = ?';
      countParams.push(status);
    }

    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;

    res.json({
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// Route pour obtenir les statistiques de paiement (propriétaire)
router.get('/parking/:parkingId/stats', async (req, res, next) => {
  try {
    const parkingId = req.params.parkingId;
    const { period = 'month' } = req.query;

    // Vérifier que l'utilisateur est propriétaire du parking
    const parking = await executeQuery(
      'SELECT owner_id FROM parkings WHERE id = ?',
      [parkingId]
    );

    if (parking.length === 0) {
      return res.status(404).json({
        error: 'Parking non trouvé',
        message: 'Le parking demandé n\'existe pas'
      });
    }

    if (parking[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'Vous n\'êtes pas autorisé à voir les statistiques de ce parking'
      });
    }

    // Calculer la date de début selon la période
    let startDate;
    switch (period) {
      case 'week':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Statistiques générales
    const stats = await executeQuery(
      `SELECT 
         COUNT(*) as total_payments,
         SUM(amount) as total_revenue,
         AVG(amount) as average_payment,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN parking_spaces ps ON r.space_id = ps.id
       WHERE ps.parking_id = ? AND p.created_at >= ?`,
      [parkingId, startDate]
    );

    // Revenus par jour
    const dailyRevenue = await executeQuery(
      `SELECT 
         DATE(p.created_at) as date,
         SUM(amount) as revenue,
         COUNT(*) as payments
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN parking_spaces ps ON r.space_id = ps.id
       WHERE ps.parking_id = ? AND p.created_at >= ? AND p.status = 'completed'
       GROUP BY DATE(p.created_at)
       ORDER BY date DESC
       LIMIT 30`,
      [parkingId, startDate]
    );

    res.json({
      period,
      stats: stats[0],
      dailyRevenue
    });

  } catch (error) {
    next(error);
  }
});

// Route pour rembourser un paiement Stripe (admin/propriétaire)
router.post('/:id/refund', [
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('La raison ne peut pas dépasser 500 caractères'),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Le montant doit être positif')
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

    const paymentId = req.params.id;
    const { reason = 'requested_by_customer', amount } = req.body;

    // Vérifier que le paiement existe
    const payment = await executeQuery(
      `SELECT p.*, ps.parking_id, park.owner_id
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN parking_spaces ps ON r.space_id = ps.id
       JOIN parkings park ON ps.parking_id = park.id
       WHERE p.id = ?`,
      [paymentId]
    );

    if (payment.length === 0) {
      return res.status(404).json({
        error: 'Paiement non trouvé',
        message: 'Le paiement demandé n\'existe pas'
      });
    }

    // Vérifier les permissions
    if (payment[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'Vous n\'êtes pas autorisé à rembourser ce paiement'
      });
    }

    if (payment[0].status !== 'completed') {
      return res.status(400).json({
        error: 'Paiement non remboursable',
        message: 'Ce paiement ne peut pas être remboursé'
      });
    }

    // Créer le remboursement via Stripe si c'est un paiement Stripe
    if (payment[0].stripe_payment_intent_id) {
      const refund = await StripeService.createRefund(paymentId, amount, reason);

      res.json({
        message: 'Remboursement traité avec succès via Stripe',
        refundId: refund.id,
        stripeRefundId: refund.id
      });
    } else {
      // Remboursement manuel pour les anciens paiements
      const result = await executeQuery(
        `INSERT INTO refunds (payment_id, amount, reason, processed_by, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [paymentId, amount || payment[0].amount, reason, req.user.id]
      );

      await executeQuery(
        'UPDATE payments SET status = "refunded", refunded_at = NOW() WHERE id = ?',
        [paymentId]
      );

      res.json({
        message: 'Remboursement traité avec succès',
        refundId: result.insertId
      });
    }

  } catch (error) {
    next(error);
  }
});

module.exports = router; 
