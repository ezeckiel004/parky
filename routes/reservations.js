const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const moment = require('moment');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');

const router = express.Router();

// Validation pour la création d'une réservation
const reservationValidation = [
  body('parkingId')
    .isInt({ min: 1 })
    .withMessage('ID de parking invalide'),
  body('startTime')
    .isISO8601()
    .withMessage('Date de début invalide'),
  body('endTime')
    .isISO8601()
    .withMessage('Date de fin invalide'),
  body('vehiclePlate')
    .optional()
    .matches(/^[A-Z0-9\s-]+$/)
    .withMessage('Plaque d\'immatriculation invalide')
];

// Route pour créer une réservation
router.post('/', reservationValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const { parkingId, startTime, endTime, vehiclePlate } = req.body;

    // Vérifier que le parking existe et a des places disponibles
    const availableSpaces = await executeQuery(
      `SELECT ps.id, ps.space_number, p.name as parking_name, p.hourly_rate
       FROM parking_spaces ps
       JOIN parkings p ON ps.parking_id = p.id
       WHERE ps.parking_id = ? AND ps.status = 'available' AND p.status = 'active'`,
      [parkingId]
    );

    if (availableSpaces.length === 0) {
      return res.status(404).json({
        error: 'Place non disponible',
        message: 'Aucune place disponible dans ce parking'
      });
    }

    // Sélectionner la première place disponible (ou implémentez une logique plus avancée si nécessaire)
    const selectedSpace = availableSpaces[0];
    const spaceId = selectedSpace.id;

    // Vérifier que les dates sont valides
    const start = moment(startTime);
    const end = moment(endTime);
    const now = moment();

    if (start.isBefore(now)) {
      return res.status(400).json({
        error: 'Date invalide',
        message: 'La date de début ne peut pas être dans le passé'
      });
    }

    if (end.isBefore(start)) {
      return res.status(400).json({
        error: 'Date invalide',
        message: 'La date de fin doit être après la date de début'
      });
    }

    // Vérifier qu'il n'y a pas de conflit de réservation pour cette place
    const conflictingReservations = await executeQuery(
      `SELECT id FROM reservations 
       WHERE space_id = ? AND status IN ('active', 'pending')
       AND (
         (start_time <= ? AND end_time >= ?) OR
         (start_time <= ? AND end_time >= ?) OR
         (start_time >= ? AND end_time <= ?)
       )`,
      [spaceId, startTime, startTime, endTime, endTime, startTime, endTime]
    );

    if (conflictingReservations.length > 0) {
      return res.status(409).json({
        error: 'Conflit de réservation',
        message: 'Cette place est déjà réservée pour cette période'
      });
    }

    // Calculer le montant total
    const duration = moment.duration(end.diff(start));
    console.log('Durée de la réservation en heures:', duration.asHours());
    const hours = Math.ceil(duration.asHours());
    const totalAmount = hours * selectedSpace.hourly_rate;
    console.log('Place:', selectedSpace);
    console.log('Montant total de la réservation:', totalAmount, '€');

    // Créer la réservation
    // Convertir au format MySQL
    const formattedStart = moment(startTime).format('YYYY-MM-DD HH:mm:ss');
    const formattedEnd = moment(endTime).format('YYYY-MM-DD HH:mm:ss');

    const result = await executeQuery(
      `INSERT INTO reservations (user_id, space_id, start_time, end_time, 
                                vehicle_plate, total_amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [req.user.id, spaceId, formattedStart, formattedEnd, vehiclePlate, totalAmount]
    );

    const reservationId = result.insertId;

    // Récupérer la réservation créée avec les infos utilisateur ET propriétaire
    const reservation = await executeQuery(
      `SELECT r.*, ps.space_number, p.id as parking_id, p.name as parking_name, p.address, p.owner_id,
              u.first_name, u.last_name, u.email,
              owner.first_name as owner_first_name, owner.last_name as owner_last_name
       FROM reservations r
       JOIN parking_spaces ps ON r.space_id = ps.id
       JOIN parkings p ON ps.parking_id = p.id
       JOIN users u ON r.user_id = u.id
       JOIN users owner ON p.owner_id = owner.id
       WHERE r.id = ?`,
      [reservationId]
    );

    const reservationData = reservation[0];

    // NOTE: L'email de confirmation de réservation sera envoyé après confirmation du paiement
    // dans la route /payments/confirm-payment pour éviter d'envoyer des confirmations
    // pour des réservations non payées

    // Envoyer les notifications push
    try {
      const notificationData = {
        ownerId: reservationData.owner_id,
        clientId: reservationData.user_id,
        clientName: `${reservationData.first_name} ${reservationData.last_name}`,
        parkingName: reservationData.parking_name,
        reservationId: reservationData.id,
        parkingId: reservationData.parking_id
      };
      
      await notificationService.sendReservationNotifications(notificationData, 'NEW_RESERVATION');
      console.log('✅ Notifications de réservation envoyées');
    } catch (notificationError) {
      console.error('❌ Erreur envoi notifications:', notificationError.message);
      // Ne pas faire échouer la réservation si les notifications échouent
    }

    res.status(201).json({
      message: 'Réservation créée avec succès',
      reservation: reservationData
    });

  } catch (error) {
    next(error);
  }
});

// Route pour récupérer les réservations de l'utilisateur
// Route pour récupérer les réservations de l'utilisateur
router.get('/my-reservations', async (req, res, next) => {
  try {
    let { page = 1, limit = 10, status } = req.query;

    // Convertir en entiers
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const offset = (page - 1) * limit;

    // Base de la requête
    let query = `
      SELECT r.*, ps.space_number, p.name as parking_name, p.address, p.hourly_rate
      FROM reservations r
      JOIN parking_spaces ps ON r.space_id = ps.id
      JOIN parkings p ON ps.parking_id = p.id
      WHERE r.user_id = ?
    `;

    const queryParams = [req.user.id];

    if (status) {
      query += ' AND r.status = ?';
      queryParams.push(status);
    }

    // ⚠️ NE PAS passer LIMIT et OFFSET comme paramètres liés
    query += ` ORDER BY r.created_at DESC LIMIT ${offset}, ${limit}`;

    const reservations = await executeQuery(query, queryParams);

    // Requête pour compter le total
    let countQuery = 'SELECT COUNT(*) as total FROM reservations WHERE user_id = ?';
    const countParams = [req.user.id];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;

    res.json({
      reservations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("ERREUR SERVEUR:", error);
    next(error);
  }
});




// Route pour récupérer une réservation spécifique
router.get('/:id', async (req, res, next) => {
  try {
    const reservationId = req.params.id;

    const reservation = await executeQuery(
      `SELECT r.*, ps.space_number, p.name as parking_name, p.address, p.hourly_rate
       FROM reservations r
       JOIN parking_spaces ps ON r.space_id = ps.id
       JOIN parkings p ON ps.parking_id = p.id
       WHERE r.id = ? AND r.user_id = ?`,
      [reservationId, req.user.id]
    );

    if (reservation.length === 0) {
      return res.status(404).json({
        error: 'Réservation non trouvée',
        message: 'La réservation demandée n\'existe pas'
      });
    }

    res.json({
      reservation: reservation[0]
    });

  } catch (error) {
    next(error);
  }
});

// Route pour annuler une réservation
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const reservationId = req.params.id;

    // Vérifier que la réservation existe et appartient à l'utilisateur
    const reservation = await executeQuery(
      'SELECT * FROM reservations WHERE id = ? AND user_id = ?',
      [reservationId, req.user.id]
    );

    if (reservation.length === 0) {
      return res.status(404).json({
        error: 'Réservation non trouvée',
        message: 'La réservation demandée n\'existe pas'
      });
    }

    if (reservation[0].status !== 'pending' && reservation[0].status !== 'active') {
      return res.status(400).json({
        error: 'Réservation non annulable',
        message: 'Cette réservation ne peut plus être annulée'
      });
    }

    // Vérifier si la réservation a déjà commencé
    const now = moment();
    const startTime = moment(reservation[0].start_time);
    
    if (now.isAfter(startTime)) {
      return res.status(400).json({
        error: 'Réservation non annulable',
        message: 'Impossible d\'annuler une réservation qui a déjà commencé'
      });
    }

    // Récupérer les détails de la réservation avec les infos utilisateur et parking
    const reservationDetails = await executeQuery(
      `SELECT r.*, ps.space_number, p.name as parking_name, p.address,
              u.first_name, u.last_name, u.email
       FROM reservations r
       JOIN parking_spaces ps ON r.space_id = ps.id
       JOIN parkings p ON ps.parking_id = p.id
       JOIN users u ON r.user_id = u.id
       WHERE r.id = ?`,
      [reservationId]
    );

    const reservationData = reservationDetails[0];

    // Annuler la réservation
    await executeQuery(
      'UPDATE reservations SET status = "cancelled", cancelled_at = NOW() WHERE id = ?',
      [reservationId]
    );

    // Envoyer l'email d'annulation
    try {
      // Calculer le remboursement éventuel (par exemple 80% si annulation plus de 2h à l'avance)
      const hoursUntilStart = startTime.diff(now, 'hours');
      const refundAmount = hoursUntilStart >= 2 ? reservationData.total_amount * 0.8 : 0;

      await emailService.sendReservationCancellation(reservationData.email, {
        userName: `${reservationData.first_name} ${reservationData.last_name}`,
        parkingName: reservationData.parking_name,
        startTime: reservationData.start_time,
        reservationId: reservationData.id,
        refundAmount: refundAmount > 0 ? refundAmount : null
      });
      console.log('✅ Email d\'annulation de réservation envoyé');
    } catch (emailError) {
      console.error('❌ Erreur envoi email d\'annulation:', emailError.message);
    }

    res.json({
      message: 'Réservation annulée avec succès'
    });

  } catch (error) {
    next(error);
  }
});

router.get('/parking/:parkingId', async (req, res, next) => {
  try {
    // ---------- 1. Validation ----------
    const parkingId = parseInt(req.params.parkingId, 10);
    if (isNaN(parkingId) || parkingId <= 0) {
      return res.status(400).json({ error: 'ID de parking invalide' });
    }

    const page   = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const offset = (page - 1) * limit;
    const status = req.query.status?.toString().trim() || null;

    // ---------- 2. Vérification propriétaire ----------
    const parking = await executeQuery(
      'SELECT owner_id FROM parkings WHERE id = ?',
      [parkingId]
    );
    if (!parking.length) {
      return res.status(404).json({ error: 'Parking non trouvé' });
    }
    if (parking[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // ---------- 3. Requête principale ----------
    let sql = `
      SELECT r.*, ps.space_number,
             u.first_name, u.last_name, u.email, u.phone
      FROM   reservations r
      JOIN   parking_spaces ps ON r.space_id = ps.id
      JOIN   users u          ON r.user_id = u.id
      WHERE  ps.parking_id = ?
    `;
    const params = [parkingId];

    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }

    // **LIMIT/OFFSET en dur dans la chaîne SQL**
    sql += ` ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const reservations = await executeQuery(sql, params);

    // ---------- 4. Comptage ----------
    let countSql = `
      SELECT COUNT(*) AS total
      FROM   reservations r
      JOIN   parking_spaces ps ON r.space_id = ps.id
      WHERE  ps.parking_id = ?
    `;
    const countParams = [parkingId];
    if (status) {
      countSql += ' AND r.status = ?';
      countParams.push(status);
    }
    const totalResult = await executeQuery(countSql, countParams);
    const total = parseInt(totalResult[0].total, 10) || 0;

    // ---------- 5. Réponse ----------
    res.json({
      reservations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Erreur route /parking/:parkingId', err);
    next(err);
  }
});

//confirmer une réservation (propriétaire)
router.patch('/:id/confirm', async (req, res, next) => {
  try {
    const reservationId = req.params.id;

    // Vérifier que la réservation existe
    const reservation = await executeQuery(
      `SELECT r.*, ps.parking_id, p.owner_id
       FROM reservations r
       JOIN parking_spaces ps ON r.space_id = ps.id
       JOIN parkings p ON ps.parking_id = p.id
       WHERE r.id = ?`,
      [reservationId]
    );

    if (reservation.length === 0) {
      return res.status(404).json({
        error: 'Réservation non trouvée',
        message: 'La réservation demandée n\'existe pas'
      });
    }

    // Vérifier que l'utilisateur est propriétaire du parking
    if (reservation[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'Vous n\'êtes pas autorisé à confirmer cette réservation'
      });
    }

    if (reservation[0].status !== 'pending') {
      return res.status(400).json({
        error: 'Réservation non confirmable',
        message: 'Cette réservation ne peut plus être confirmée'
      });
    }

    // Confirmer la réservation
    await executeQuery(
      'UPDATE reservations SET status = "active", confirmed_at = NOW() WHERE id = ?',
      [reservationId]
    );

    // Marquer la place comme occupée
    await executeQuery(
      'UPDATE parking_spaces SET status = "occupied" WHERE id = ?',
      [reservation[0].space_id]
    );

    res.json({
      message: 'Réservation confirmée avec succès'
    });

  } catch (error) {
    next(error);
  }
});

// Route pour terminer une réservation (propriétaire)
router.patch('/:id/complete', async (req, res, next) => {
  try {
    const reservationId = req.params.id;

    // Vérifier que la réservation existe
    const reservation = await executeQuery(
      `SELECT r.*, ps.parking_id, p.owner_id, ps.id as space_id
       FROM reservations r
       JOIN parking_spaces ps ON r.space_id = ps.id
       JOIN parkings p ON ps.parking_id = p.id
       WHERE r.id = ?`,
      [reservationId]
    );

    if (reservation.length === 0) {
      return res.status(404).json({
        error: 'Réservation non trouvée',
        message: 'La réservation demandée n\'existe pas'
      });
    }

    // Vérifier que l'utilisateur est propriétaire du parking
    if (reservation[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'Vous n\'êtes pas autorisé à terminer cette réservation'
      });
    }

    if (reservation[0].status !== 'active') {
      return res.status(400).json({
        error: 'Réservation non terminable',
        message: 'Cette réservation ne peut pas être terminée'
      });
    }

    // Terminer la réservation
    await executeQuery(
      'UPDATE reservations SET status = "completed", completed_at = NOW() WHERE id = ?',
      [reservationId]
    );

    // Libérer la place
    await executeQuery(
      'UPDATE parking_spaces SET status = "available" WHERE id = ?',
      [reservation[0].space_id]
    );

    res.json({
      message: 'Réservation terminée avec succès'
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router; 
