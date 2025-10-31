const express = require('express');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Route pour lister toutes les demandes de suppression (admin uniquement)
router.get('/account-deletions', authenticateToken, async (req, res, next) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'Seuls les administrateurs peuvent accéder à cette ressource'
      });
    }

    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Construire la requête avec filtre optionnel
    let query = `
      SELECT 
        ad.id,
        ad.reason,
        ad.requested_at,
        ad.processed_at,
        ad.status,
        ad.admin_notes,
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.status as user_status
      FROM account_deletions ad
      JOIN users u ON ad.user_id = u.id
    `;
    
    const params = [];
    if (status) {
      query += ' WHERE ad.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY ad.requested_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const deletions = await executeQuery(query, params);

    // Compter le total pour la pagination
    let countQuery = 'SELECT COUNT(*) as total FROM account_deletions';
    const countParams = [];
    if (status) {
      countQuery += ' WHERE status = ?';
      countParams.push(status);
    }
    
    const [{ total }] = await executeQuery(countQuery, countParams);

    res.json({
      deletions,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / limit),
        total_items: total,
        items_per_page: parseInt(limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// Route pour traiter une demande de suppression (admin uniquement)
router.put('/account-deletions/:id', authenticateToken, async (req, res, next) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'Seuls les administrateurs peuvent traiter les demandes de suppression'
      });
    }

    const { id } = req.params;
    const { status, admin_notes } = req.body;

    // Vérifier que le statut est valide
    const validStatuses = ['pending', 'approved', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Statut invalide',
        message: 'Le statut doit être: pending, approved, completed, ou cancelled'
      });
    }

    // Vérifier que la demande existe
    const deletion = await executeQuery(
      'SELECT * FROM account_deletions WHERE id = ?',
      [id]
    );

    if (deletion.length === 0) {
      return res.status(404).json({
        error: 'Demande non trouvée',
        message: 'Cette demande de suppression n\'existe pas'
      });
    }

    // Mettre à jour la demande
    let processedAt = null;
    if (status === 'approved' || status === 'completed' || status === 'cancelled') {
      processedAt = new Date();
    }

    await executeQuery(
      `UPDATE account_deletions 
       SET status = ?, admin_notes = ?, processed_at = ?, updated_at = NOW() 
       WHERE id = ?`,
      [status, admin_notes || null, processedAt, id]
    );

    // Si approuvé ou complété, mettre à jour le statut utilisateur
    if (status === 'approved' || status === 'completed') {
      await executeQuery(
        'UPDATE users SET status = "deleted", updated_at = NOW() WHERE id = ?',
        [deletion[0].user_id]
      );
    } else if (status === 'cancelled') {
      // Si annulé, remettre le compte en actif
      await executeQuery(
        'UPDATE users SET status = "active", updated_at = NOW() WHERE id = ?',
        [deletion[0].user_id]
      );
    }

    console.log(`✅ Demande de suppression ${id} mise à jour: ${status}`);

    res.json({
      message: `Demande de suppression ${status === 'approved' ? 'approuvée' : status === 'completed' ? 'complétée' : status === 'cancelled' ? 'annulée' : 'mise à jour'}`,
      deletion_id: id,
      new_status: status
    });

  } catch (error) {
    next(error);
  }
});

// Route pour obtenir les statistiques des suppressions (admin uniquement)
router.get('/account-deletions/stats', authenticateToken, async (req, res, next) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'Seuls les administrateurs peuvent accéder aux statistiques'
      });
    }

    // Statistiques par statut
    const statusStats = await executeQuery(`
      SELECT status, COUNT(*) as count
      FROM account_deletions
      GROUP BY status
    `);

    // Statistiques par mois
    const monthlyStats = await executeQuery(`
      SELECT 
        DATE_FORMAT(requested_at, '%Y-%m') as month,
        COUNT(*) as count
      FROM account_deletions
      WHERE requested_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(requested_at, '%Y-%m')
      ORDER BY month DESC
    `);

    // Top raisons de suppression
    const reasonStats = await executeQuery(`
      SELECT 
        reason,
        COUNT(*) as count
      FROM account_deletions
      WHERE requested_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
      GROUP BY reason
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      status_statistics: statusStats,
      monthly_statistics: monthlyStats,
      top_reasons: reasonStats
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;