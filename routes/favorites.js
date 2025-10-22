const express = require('express');
const { executeQuery } = require('../config/database');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// Ajouter un parking aux favoris
router.post('/', async (req, res, next) => {
  try {
    const { parkingId } = req.body;
    const userId = req.user.id;

    // Vérifier si le parking existe
    const parking = await executeQuery(
      'SELECT id FROM parkings WHERE id = ? AND status = "active"',
      [parkingId]
    );

    if (parking.length === 0) {
      return next(createError('Parking non trouvé ou non disponible.', 404));
    }

    // Vérifier si déjà en favoris
    const existingFavorite = await executeQuery(
      'SELECT id FROM favorites WHERE user_id = ? AND parking_id = ?',
      [userId, parkingId]
    );

    if (existingFavorite.length > 0) {
      return next(createError('Ce parking est déjà dans vos favoris.', 409));
    }

    // Ajouter aux favoris
    await executeQuery(
      'INSERT INTO favorites (user_id, parking_id) VALUES (?, ?)',
      [userId, parkingId]
    );

    res.status(201).json({
      success: true,
      message: 'Parking ajouté aux favoris avec succès'
    });

  } catch (error) {
    next(error);
  }
});

// Récupérer les favoris de l'utilisateur
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Récupérer les favoris avec les détails du parking
    const favorites = await executeQuery(`
      SELECT 
        f.id as favorite_id,
        f.created_at as added_at,
        p.id,
        p.name,
        p.address,
        p.latitude,
        p.longitude,
        p.total_spaces,
        p.hourly_rate,
        p.description,
        u.first_name as owner_first_name,
        u.last_name as owner_last_name
      FROM favorites f
      JOIN parkings p ON f.parking_id = p.id
      JOIN users u ON p.owner_id = u.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `, [userId]);

    // Compter le total
    const totalResult = await executeQuery(
      'SELECT COUNT(*) as total FROM favorites WHERE user_id = ?',
      [userId]
    );
    const total = totalResult[0].total;

    // Formater les résultats
    const formattedFavorites = favorites.map(fav => ({
      id: fav.favorite_id,
      addedAt: fav.added_at,
      parking: {
        id: fav.id,
        name: fav.name,
        address: fav.address,
        latitude: fav.latitude,
        longitude: fav.longitude,
        totalSpaces: fav.total_spaces,
        availableSpaces: fav.available_spaces,
        hourlyRate: fav.price_per_hour,
        description: fav.description,
        isActive: fav.is_active,
        owner: {
          firstName: fav.owner_first_name,
          lastName: fav.owner_last_name
        }
      }
    }));

    res.json({
      success: true,
      data: {
        favorites: formattedFavorites,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// Supprimer un favori
router.delete('/:parkingId', async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const userId = req.user.id;

    const result = await executeQuery(
      'DELETE FROM favorites WHERE user_id = ? AND parking_id = ?',
      [userId, parkingId]
    );

    if (result.affectedRows === 0) {
      return next(createError('Favori non trouvé.', 404));
    }

    res.json({
      success: true,
      message: 'Favori supprimé avec succès'
    });

  } catch (error) {
    next(error);
  }
});

// Vérifier si un parking est en favoris
router.get('/check/:parkingId', async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const userId = req.user.id;

    const favorite = await executeQuery(
      'SELECT id FROM favorites WHERE user_id = ? AND parking_id = ?',
      [userId, parkingId]
    );

    res.json({
      success: true,
      data: {
        isFavorite: favorite.length > 0
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
