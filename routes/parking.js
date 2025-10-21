const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// Validation pour la création/modification d'un parking
const parkingValidation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Le nom doit contenir entre 3 et 100 caractères'),
  body('address')
    .trim()
    .isLength({ min: 10 })
    .withMessage('L\'adresse doit contenir au moins 10 caractères'),
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide'),
  body('totalSpaces')
    .isInt({ min: 1 })
    .withMessage('Le nombre total de places doit être supérieur à 0'),
  body('hourlyRate')
    .isFloat({ min: 0 })
    .withMessage('Le tarif horaire doit être positif'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La description ne peut pas dépasser 500 caractères'),
  body('amenities')
    .optional()
    .isArray()
    .withMessage('Les équipements doivent être un tableau')
];

// Route pour récupérer tous les parkings (publique)
router.get('/', async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      lat, 
      lng, 
      radius = 10, 
      price_min, 
      price_max,
      amenities,
      available
    } = req.query;

    const offset = (page - 1) * limit;

    // Construire la requête de base
    let query = `
      SELECT p.*, 
             u.first_name as owner_name,
             u.phone as owner_phone,
             COUNT(DISTINCT ps.id) as total_spaces,
             COUNT(DISTINCT CASE WHEN ps.status = 'available' THEN ps.id END) as available_spaces
      FROM parkings p
      LEFT JOIN users u ON p.owner_id = u.id
      LEFT JOIN parking_spaces ps ON p.id = ps.parking_id
      WHERE p.status = 'active'
    `;
    const queryParams = [];

    // Filtre par distance si lat/lng fournis
    if (lat && lng) {
      query += `
        AND (
          6371 * acos(
            cos(radians(?)) * cos(radians(p.latitude)) * 
            cos(radians(p.longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(p.latitude))
          )
        ) <= ?
      `;
      queryParams.push(parseFloat(lat), parseFloat(lng), parseFloat(lat), parseFloat(radius));
    }

    // Filtre par prix
    if (price_min) {
      query += ' AND p.hourly_rate >= ?';
      queryParams.push(parseFloat(price_min));
    }
    if (price_max) {
      query += ' AND p.hourly_rate <= ?';
      queryParams.push(parseFloat(price_max));
    }

    // Filtre par équipements
    if (amenities) {
      const amenitiesArray = amenities.split(',');
      amenitiesArray.forEach((amenity, index) => {
        query += ` AND p.amenities LIKE ?`;
        queryParams.push(`%${amenity.trim()}%`);
      });
    }

    // Filtre par disponibilité
    if (available === 'true') {
      query += ' HAVING available_spaces > 0';
    }

    const safeLimit = Number.isInteger(parseInt(limit)) ? parseInt(limit) : 10;
const safeOffset = Number.isInteger(parseInt(offset)) ? parseInt(offset) : 0;

query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    queryParams.push(parseInt(limit), offset);

    const parkings = await executeQuery(query, queryParams);

    // Parser les amenities JSON pour chaque parking
    const parsedParkings = parkings.map(parking => {
      try {
        // Parse amenities si c'est une string JSON
        if (parking.amenities && typeof parking.amenities === 'string') {
          parking.amenities = JSON.parse(parking.amenities);
        }
      } catch (e) {
        // Si le parsing échoue, utiliser un tableau vide
        parking.amenities = [];
      }
      return parking;
    });

    // Compter le total
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM parkings p
      WHERE p.status = 'active'
    `;
    const countParams = [];

    if (lat && lng) {
      countQuery += `
        AND (
          6371 * acos(
            cos(radians(?)) * cos(radians(p.latitude)) * 
            cos(radians(p.longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(p.latitude))
          )
        ) <= ?
      `;
      countParams.push(parseFloat(lat), parseFloat(lng), parseFloat(lat), parseFloat(radius));
    }

    if (price_min) {
      countQuery += ' AND p.hourly_rate >= ?';
      countParams.push(parseFloat(price_min));
    }
    if (price_max) {
      countQuery += ' AND p.hourly_rate <= ?';
      countParams.push(parseFloat(price_max));
    }

    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;

    res.json({
      parkings: parsedParkings,
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

// Route pour récupérer un parking spécifique
router.get('/:id', async (req, res, next) => {
  try {
    const parkingId = req.params.id;

    const parking = await executeQuery(
      `SELECT p.*, 
              u.first_name as owner_name,
              u.last_name as owner_last_name,
              u.phone as owner_phone,
              u.email as owner_email,
              COUNT(DISTINCT ps.id) as total_spaces,
              COUNT(DISTINCT CASE WHEN ps.status = 'available' THEN ps.id END) as available_spaces
       FROM parkings p
       LEFT JOIN users u ON p.owner_id = u.id
       LEFT JOIN parking_spaces ps ON p.id = ps.parking_id
       WHERE p.id = ? AND p.status = 'active'
       GROUP BY p.id`,
      [parkingId]
    );

    if (parking.length === 0) {
      return res.status(404).json({
        error: 'Parking non trouvé',
        message: 'Le parking demandé n\'existe pas'
      });
    }

    // Parser les amenities pour le parking
    const parkingData = parking[0];
    try {
      if (parkingData.amenities && typeof parkingData.amenities === 'string') {
        parkingData.amenities = JSON.parse(parkingData.amenities);
      }
    } catch (e) {
      parkingData.amenities = [];
    }

    // Récupérer les places de parking
    const spaces = await executeQuery(
      `SELECT id, space_number, status, vehicle_type, hourly_rate
       FROM parking_spaces 
       WHERE parking_id = ?
       ORDER BY space_number`,
      [parkingId]
    );

    res.json({
      parking: parkingData,
      spaces
    });

  } catch (error) {
    next(error);
  }
});

// Route pour créer un parking (propriétaire seulement)
router.post('/', authenticateToken, authorizeRoles('proprietaire', 'admin'), parkingValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const {
      name,
      address,
      latitude,
      longitude,
      totalSpaces,
      hourlyRate,
      description,
      amenities = []
    } = req.body;

    // Insérer le parking
    const result = await executeQuery(
      `INSERT INTO parkings (name, address, latitude, longitude, total_spaces, 
                            hourly_rate, description, amenities, owner_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [name, address, latitude, longitude, totalSpaces, hourlyRate, description, 
       JSON.stringify(amenities), req.user.id]
    );

    const parkingId = result.insertId;

    // Créer les places de parking
    const spacePromises = [];
    for (let i = 1; i <= totalSpaces; i++) {
      spacePromises.push(
        executeQuery(
          `INSERT INTO parking_spaces (parking_id, space_number, status, hourly_rate, created_at)
           VALUES (?, ?, 'available', ?, NOW())`,
          [parkingId, i, hourlyRate]
        )
      );
    }

    await Promise.all(spacePromises);

    // Récupérer le parking créé
    const parking = await executeQuery(
      `SELECT p.*, 
              u.first_name as owner_name,
              u.last_name as owner_last_name,
              COUNT(DISTINCT ps.id) as total_spaces,
              COUNT(DISTINCT CASE WHEN ps.status = 'available' THEN ps.id END) as available_spaces
       FROM parkings p
       LEFT JOIN users u ON p.owner_id = u.id
       LEFT JOIN parking_spaces ps ON p.id = ps.parking_id
       WHERE p.id = ?
       GROUP BY p.id`,
      [parkingId]
    );

    res.status(201).json({
      message: 'Parking créé avec succès',
      parking: parking[0]
    });

  } catch (error) {
    next(error);
  }
});

// Route pour mettre à jour un parking
router.put('/:id', authorizeRoles('proprietaire', 'admin'), parkingValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const parkingId = req.params.id;
    const {
      name,
      address,
      latitude,
      longitude,
      hourlyRate,
      description,
      amenities
    } = req.body;

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
        message: 'Vous n\'êtes pas autorisé à modifier ce parking'
      });
    }

    // Mettre à jour le parking
    await executeQuery(
      `UPDATE parkings 
       SET name = ?, address = ?, latitude = ?, longitude = ?, 
           hourly_rate = ?, description = ?, amenities = ?, updated_at = NOW()
       WHERE id = ?`,
      [name, address, latitude, longitude, hourlyRate, description, 
       JSON.stringify(amenities), parkingId]
    );

    // Mettre à jour le tarif des places disponibles
    await executeQuery(
      `UPDATE parking_spaces 
       SET hourly_rate = ? 
       WHERE parking_id = ? AND status = 'available'`,
      [hourlyRate, parkingId]
    );

    res.json({
      message: 'Parking mis à jour avec succès'
    });

  } catch (error) {
    next(error);
  }
});

// Route pour supprimer un parking
router.delete('/:id', authorizeRoles('proprietaire', 'admin'), async (req, res, next) => {
  try {
    const parkingId = req.params.id;

    // Vérifier que l'utilisateur est propriétaire du parking
    const parking = await executeQuery(
      'SELECT owner_id, status FROM parkings WHERE id = ?',
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
        message: 'Vous n\'êtes pas autorisé à supprimer ce parking'
      });
    }

    // Vérifier s'il y a des réservations actives
    const activeReservations = await executeQuery(
      `SELECT COUNT(*) as count FROM reservations r
       JOIN parking_spaces ps ON r.space_id = ps.id
       WHERE ps.parking_id = ? AND r.status IN ('active', 'pending')`,
      [parkingId]
    );

    if (activeReservations[0].count > 0) {
      return res.status(400).json({
        error: 'Suppression impossible',
        message: 'Ce parking ne peut pas être supprimé car il a des réservations actives'
      });
    }

    // Soft delete du parking
    await executeQuery(
      'UPDATE parkings SET status = "deleted", deleted_at = NOW() WHERE id = ?',
      [parkingId]
    );

    res.json({
      message: 'Parking supprimé avec succès'
    });

  } catch (error) {
    next(error);
  }
});

// Route pour récupérer les parkings d'un propriétaire
router.get('/owner/my-parkings', authenticateToken, authorizeRoles('proprietaire', 'admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.*, 
             COUNT(DISTINCT ps.id) as total_spaces,
             COUNT(DISTINCT CASE WHEN ps.status = 'available' THEN ps.id END) as available_spaces
      FROM parkings p
      LEFT JOIN parking_spaces ps ON p.id = ps.parking_id
      WHERE p.owner_id = ?
    `;
    const queryParams = [req.user.id];

    if (status) {
      query += ' AND p.status = ?';
      queryParams.push(status);
    } else {
      query += ' AND p.status != "deleted"';
    }

    query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;

    const parkings = await executeQuery(query, queryParams);
    
    // Parser les amenities pour chaque parking
    const parsedParkings = parkings.map(parking => {
      try {
        if (parking.amenities && typeof parking.amenities === 'string') {
          parking.amenities = JSON.parse(parking.amenities);
        }
      } catch (e) {
        parking.amenities = [];
      }
      return parking;
    });
    
    // Compter le total
    let countQuery = 'SELECT COUNT(*) as total FROM parkings WHERE owner_id = ?';
    const countParams = [req.user.id];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    } else {
      countQuery += ' AND status != "deleted"';
    }

    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;

    res.json({
      parkings: parsedParkings,
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

module.exports = router; 
