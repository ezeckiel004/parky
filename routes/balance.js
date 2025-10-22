const express = require('express');
const { authorizeRoles } = require('../middleware/auth');
const BalanceService = require('../services/balanceService');

const router = express.Router();

// Récupérer la balance du propriétaire connecté
router.get('/my-balance', authorizeRoles('proprietaire'), async (req, res, next) => {
  try {
    const balance = await BalanceService.getOwnerBalance(req.user.id);

    res.json({
      message: 'Balance récupérée avec succès',
      balance
    });
  } catch (error) {
    next(error);
  }
});

// Récupérer l'historique des transactions du propriétaire connecté
router.get('/my-transactions', authorizeRoles('proprietaire'), async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const result = await BalanceService.getOwnerTransactions(req.user.id, page, limit);

    res.json({
      message: 'Transactions récupérées avec succès',
      ...result
    });
  } catch (error) {
    next(error);
  }
});

// Statistiques de revenus du propriétaire connecté
router.get('/my-stats', authorizeRoles('proprietaire'), async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const stats = await BalanceService.getOwnerStats(req.user.id, period);

    res.json({
      message: 'Statistiques récupérées avec succès',
      stats
    });
  } catch (error) {
    next(error);
  }
});

// Routes admin pour voir les balances de tous les propriétaires
router.get('/owner/:ownerId/balance', authorizeRoles('admin'), async (req, res, next) => {
  try {
    const ownerId = req.params.ownerId;
    const balance = await BalanceService.getOwnerBalance(ownerId);

    res.json({
      message: 'Balance propriétaire récupérée avec succès',
      ownerId,
      balance
    });
  } catch (error) {
    next(error);
  }
});

// Routes admin pour voir les transactions d'un propriétaire
router.get('/owner/:ownerId/transactions', authorizeRoles('admin'), async (req, res, next) => {
  try {
    const ownerId = req.params.ownerId;
    const { page = 1, limit = 10 } = req.query;
    const result = await BalanceService.getOwnerTransactions(ownerId, page, limit);

    res.json({
      message: 'Transactions propriétaire récupérées avec succès',
      ownerId,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

// Routes admin pour voir les statistiques d'un propriétaire
router.get('/owner/:ownerId/stats', authorizeRoles('admin'), async (req, res, next) => {
  try {
    const ownerId = req.params.ownerId;
    const { period = 'month' } = req.query;
    const stats = await BalanceService.getOwnerStats(ownerId, period);

    res.json({
      message: 'Statistiques propriétaire récupérées avec succès',
      ownerId,
      stats
    });
  } catch (error) {
    next(error);
  }
});

// Route admin pour voir un résumé de toutes les balances
router.get('/summary', authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { executeQuery } = require('../config/database');

    // Récupérer un résumé de toutes les balances
    const summary = await executeQuery(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        ob.current_balance,
        ob.total_earned,
        ob.last_transaction_at,
        COUNT(p.id) as total_parkings
      FROM users u
      LEFT JOIN owner_balances ob ON u.id = ob.owner_id
      LEFT JOIN parkings p ON u.id = p.owner_id AND p.status = 'active'
      WHERE u.role = 'proprietaire'
      GROUP BY u.id, ob.current_balance, ob.total_earned, ob.last_transaction_at
      ORDER BY ob.current_balance DESC
    `);

    // Statistiques globales
    const globalStats = await executeQuery(`
      SELECT
        COUNT(DISTINCT owner_id) as total_owners,
        SUM(current_balance) as total_balances,
        SUM(total_earned) as total_earned_all_time,
        AVG(current_balance) as avg_balance
      FROM owner_balances
    `);

    res.json({
      message: 'Résumé des balances récupéré avec succès',
      summary,
      globalStats: globalStats[0]
    });
  } catch (error) {
    next(error);
  }
});

// Route admin pour marquer les paiements spécifiques comme effectués
router.post('/mark-paid', authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { body, validationResult } = require('express-validator');
    const { executeQuery } = require('../config/database');

    // Validation
    await body('ownerIds')
      .isArray({ min: 1 })
      .withMessage('ownerIds doit être un tableau non vide')
      .run(req);

    await body('ownerIds.*')
      .isInt({ min: 1 })
      .withMessage('Chaque ownerId doit être un entier positif')
      .run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const { ownerIds } = req.body;

    // Vérifier que tous les propriétaires existent
    const existingOwners = await executeQuery(
      `SELECT id, first_name, last_name, email
       FROM users
       WHERE id IN (${ownerIds.map(() => '?').join(',')}) AND role = 'proprietaire'`,
      ownerIds
    );

    if (existingOwners.length !== ownerIds.length) {
      const existingIds = existingOwners.map(o => o.id);
      const missingIds = ownerIds.filter(id => !existingIds.includes(id));

      return res.status(404).json({
        error: 'Propriétaires non trouvés',
        message: `Les propriétaires suivants n'existent pas: ${missingIds.join(', ')}`
      });
    }

    // Récupérer les balances avant mise à jour
    const beforeBalances = await executeQuery(
      `SELECT owner_id, current_balance
       FROM owner_balances
       WHERE owner_id IN (${ownerIds.map(() => '?').join(',')})`,
      ownerIds
    );

    // Créer les transactions de paiement pour chaque propriétaire
    const transactionPromises = beforeBalances.map(balance => {
      if (balance.current_balance > 0) {
        return executeQuery(
          `INSERT INTO balance_transactions
           (owner_id, type, amount, description, created_at)
           VALUES (?, 'withdrawal', ?, 'Paiement effectué par admin', NOW())`,
          [balance.owner_id, balance.current_balance]
        );
      }
      return Promise.resolve();
    });

    await Promise.all(transactionPromises);

    // Remettre les balances à zéro
    await executeQuery(
      `UPDATE owner_balances
       SET current_balance = 0, last_transaction_at = NOW()
       WHERE owner_id IN (${ownerIds.map(() => '?').join(',')})`,
      ownerIds
    );

    // Récupérer les propriétaires mis à jour
    const updatedOwners = await executeQuery(
      `SELECT u.id, u.first_name, u.last_name, u.email, ob.current_balance
       FROM users u
       LEFT JOIN owner_balances ob ON u.id = ob.owner_id
       WHERE u.id IN (${ownerIds.map(() => '?').join(',')})`,
      ownerIds
    );

    res.json({
      message: `Paiements marqués comme effectués pour ${ownerIds.length} propriétaire(s)`,
      processedOwners: updatedOwners,
      totalPaidOut: beforeBalances.reduce((sum, b) => sum + parseFloat(b.current_balance || 0), 0)
    });

  } catch (error) {
    next(error);
  }
});

// Route admin pour marquer TOUS les paiements comme effectués
router.post('/mark-all-paid', authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { executeQuery } = require('../config/database');

    // Récupérer toutes les balances non nulles
    const allBalances = await executeQuery(
      `SELECT ob.owner_id, ob.current_balance, u.first_name, u.last_name, u.email
       FROM owner_balances ob
       JOIN users u ON ob.owner_id = u.id
       WHERE ob.current_balance > 0 AND u.role = 'proprietaire'`
    );

    if (allBalances.length === 0) {
      return res.json({
        message: 'Aucun propriétaire n\'a de balance à payer',
        processedOwners: [],
        totalPaidOut: 0
      });
    }

    // Créer les transactions de paiement pour tous
    const transactionPromises = allBalances.map(balance =>
      executeQuery(
        `INSERT INTO balance_transactions
         (owner_id, type, amount, description, created_at)
         VALUES (?, 'withdrawal', ?, 'Paiement global effectué par admin', NOW())`,
        [balance.owner_id, balance.current_balance]
      )
    );

    await Promise.all(transactionPromises);

    // Remettre toutes les balances à zéro
    await executeQuery(
      `UPDATE owner_balances
       SET current_balance = 0, last_transaction_at = NOW()
       WHERE current_balance > 0`
    );

    const totalPaidOut = allBalances.reduce((sum, b) => sum + parseFloat(b.current_balance), 0);

    res.json({
      message: `Paiements marqués comme effectués pour TOUS les propriétaires (${allBalances.length})`,
      processedOwners: allBalances.map(b => ({
        id: b.owner_id,
        first_name: b.first_name,
        last_name: b.last_name,
        email: b.email,
        current_balance: 0,
        previous_balance: b.current_balance
      })),
      totalPaidOut: totalPaidOut
    });

  } catch (error) {
    next(error);
  }
});

// ========== DEMANDES DE RETRAIT ==========

// Créer une demande de retrait (propriétaire)
router.post('/withdrawal-request', authorizeRoles('proprietaire'), async (req, res, next) => {
  try {
    const { body, validationResult } = require('express-validator');
    const { executeQuery } = require('../config/database');

    // Validation
    await body('amount')
      .isFloat({ min: 1 })
      .withMessage('Le montant doit être supérieur à 0')
      .run(req);

    await body('paymentMethod')
      .isIn(['bank_transfer', 'paypal'])
      .withMessage('Méthode de paiement invalide')
      .run(req);

    await body('bankDetails')
      .optional()
      .isObject()
      .withMessage('Les détails bancaires doivent être un objet')
      .run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: errors.array()
      });
    }

    const { amount, paymentMethod, bankDetails } = req.body;
    const ownerId = req.user.id;

    // Vérifier la balance du propriétaire
    const balance = await BalanceService.getOwnerBalance(ownerId);
    if (!balance || parseFloat(balance.current_balance) < amount) {
      return res.status(400).json({
        error: 'Solde insuffisant',
        message: 'Votre solde actuel ne permet pas ce retrait',
        currentBalance: balance ? balance.current_balance : 0
      });
    }

    // Vérifier s'il n'y a pas déjà une demande en attente
    const existingRequest = await executeQuery(
      'SELECT id FROM withdrawal_requests WHERE owner_id = ? AND status = "pending"',
      [ownerId]
    );

    if (existingRequest.length > 0) {
      return res.status(400).json({
        error: 'Demande en cours',
        message: 'Vous avez déjà une demande de retrait en attente'
      });
    }

    // Créer la demande de retrait
    const result = await executeQuery(
      `INSERT INTO withdrawal_requests 
       (owner_id, amount, payment_method, bank_details, requested_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [ownerId, amount, paymentMethod, JSON.stringify(bankDetails || {})]
    );

    res.status(201).json({
      message: 'Demande de retrait créée avec succès',
      withdrawalRequest: {
        id: result.insertId,
        amount,
        paymentMethod,
        status: 'pending',
        requestedAt: new Date()
      }
    });

  } catch (error) {
    next(error);
  }
});

// Récupérer les demandes de retrait du propriétaire
router.get('/my-withdrawal-requests', authorizeRoles('proprietaire'), async (req, res, next) => {
  try {
    const { executeQuery } = require('../config/database');
    
    // Conversion ultra-sécurisée des paramètres
    let pageParam = req.query.page;
    let limitParam = req.query.limit;
    
    // Assurer que page est un entier valide
    const pageNum = Number.isInteger(parseInt(pageParam)) && parseInt(pageParam) > 0 
      ? parseInt(pageParam) 
      : 1;
    
    // Assurer que limit est un entier valide entre 1 et 100
    const limitNum = Number.isInteger(parseInt(limitParam)) && parseInt(limitParam) > 0 && parseInt(limitParam) <= 100
      ? parseInt(limitParam)
      : 10;
    
    // Calculer offset comme entier
    const offsetNum = Math.max(0, (pageNum - 1) * limitNum);

    console.log(`[DEBUG] My Requests - Page: ${pageNum}, Limit: ${limitNum}, Offset: ${offsetNum}, User ID: ${req.user.id}`);

    const requests = await executeQuery(
      `SELECT wr.*, u.first_name, u.last_name,
              admin.first_name as processed_by_first_name,
              admin.last_name as processed_by_last_name
       FROM withdrawal_requests wr
       LEFT JOIN users u ON wr.owner_id = u.id
       LEFT JOIN users admin ON wr.processed_by = admin.id
       WHERE wr.owner_id = ?
       ORDER BY wr.requested_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limitNum, offsetNum]
    );

    // Compter le total
    const totalResult = await executeQuery(
      'SELECT COUNT(*) as total FROM withdrawal_requests WHERE owner_id = ?',
      [req.user.id]
    );

    res.json({
      message: 'Demandes de retrait récupérées avec succès',
      withdrawalRequests: requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult[0].total,
        pages: Math.ceil(totalResult[0].total / limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// Routes admin pour gérer les demandes de retrait
router.get('/withdrawal-requests', authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { executeQuery } = require('../config/database');
    
    // Conversion ultra-sécurisée des paramètres
    let pageParam = req.query.page;
    let limitParam = req.query.limit;
    let statusParam = req.query.status;
    
    // Assurer que page est un entier valide
    const pageNum = Number.isInteger(parseInt(pageParam)) && parseInt(pageParam) > 0 
      ? parseInt(pageParam) 
      : 1;
    
    // Assurer que limit est un entier valide entre 1 et 100
    const limitNum = Number.isInteger(parseInt(limitParam)) && parseInt(limitParam) > 0 && parseInt(limitParam) <= 100
      ? parseInt(limitParam)
      : 10;
    
    // Calculer offset comme entier
    const offsetNum = Math.max(0, (pageNum - 1) * limitNum);

    console.log(`[DEBUG] Pagination - Page: ${pageNum}, Limit: ${limitNum}, Offset: ${offsetNum}, Status: ${statusParam}`);

    let query = `
      SELECT wr.*, u.first_name, u.last_name, u.email,
             admin.first_name as processed_by_first_name,
             admin.last_name as processed_by_last_name
      FROM withdrawal_requests wr
      LEFT JOIN users u ON wr.owner_id = u.id
      LEFT JOIN users admin ON wr.processed_by = admin.id
      WHERE 1=1
    `;
    const params = [];

    if (statusParam && typeof statusParam === 'string' && statusParam.trim().length > 0) {
      query += ' AND wr.status = ?';
      params.push(statusParam.trim());
    }

    query += ' ORDER BY wr.requested_at DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offsetNum);

    console.log(`[DEBUG] Query: ${query}`);
    console.log(`[DEBUG] Params:`, params, `Types:`, params.map(p => typeof p));

    const requests = await executeQuery(query, params);

    // Compter le total
    let countQuery = 'SELECT COUNT(*) as total FROM withdrawal_requests WHERE 1=1';
    const countParams = [];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    const totalResult = await executeQuery(countQuery, countParams);

    res.json({
      message: 'Demandes de retrait récupérées avec succès',
      withdrawalRequests: requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult[0].total,
        pages: Math.ceil(totalResult[0].total / limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// Approuver/Rejeter une demande de retrait (admin)
router.patch('/withdrawal-requests/:id', authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { body, validationResult } = require('express-validator');
    const { executeQuery } = require('../config/database');

    await body('status')
      .isIn(['approved', 'rejected', 'processed'])
      .withMessage('Statut invalide')
      .run(req);

    await body('adminNotes')
      .optional()
      .isString()
      .withMessage('Les notes admin doivent être une chaîne')
      .run(req);

    await body('rejectionReason')
      .if(body('status').equals('rejected'))
      .notEmpty()
      .withMessage('La raison du rejet est requise')
      .run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { status, adminNotes, rejectionReason } = req.body;

    // Vérifier que la demande existe et est en attente
    const request = await executeQuery(
      'SELECT * FROM withdrawal_requests WHERE id = ? AND status = "pending"',
      [id]
    );

    if (request.length === 0) {
      return res.status(404).json({
        error: 'Demande non trouvée',
        message: 'La demande de retrait n\'existe pas ou n\'est plus en attente'
      });
    }

    const withdrawalRequest = request[0];

    // Mettre à jour la demande
    await executeQuery(
      `UPDATE withdrawal_requests 
       SET status = ?, processed_at = NOW(), processed_by = ?, 
           admin_notes = ?, rejection_reason = ?
       WHERE id = ?`,
      [status, req.user.id, adminNotes, rejectionReason, id]
    );

    // Si approuvée, déduire le montant de la balance et créer la transaction
    if (status === 'approved') {
      // Vérifier que le propriétaire a suffisamment de fonds
      const currentBalance = await executeQuery(
        'SELECT current_balance FROM owner_balances WHERE owner_id = ?',
        [withdrawalRequest.owner_id]
      );

      if (currentBalance.length === 0 || parseFloat(currentBalance[0].current_balance) < parseFloat(withdrawalRequest.amount)) {
        return res.status(400).json({
          error: 'Solde insuffisant',
          message: 'Le propriétaire n\'a pas suffisamment de fonds pour cette demande'
        });
      }

      // Créer une transaction de retrait
      await executeQuery(
        `INSERT INTO balance_transactions
         (owner_id, type, amount, description, created_at)
         VALUES (?, 'withdrawal', ?, ?, NOW())`,
        [
          withdrawalRequest.owner_id,
          withdrawalRequest.amount,
          `Retrait approuvé - Demande #${id}`
        ]
      );

      // Déduire de la balance
      await executeQuery(
        `UPDATE owner_balances 
         SET current_balance = current_balance - ?, last_transaction_at = NOW()
         WHERE owner_id = ?`,
        [withdrawalRequest.amount, withdrawalRequest.owner_id]
      );

      console.log(`💰 Balance déduite: ${withdrawalRequest.amount}€ pour le propriétaire ${withdrawalRequest.owner_id}`);
    }

    res.json({
      message: `Demande de retrait ${status === 'approved' ? 'approuvée' : status === 'rejected' ? 'rejetée' : 'traitée'} avec succès`,
      withdrawalRequest: {
        id: parseInt(id),
        status,
        processedAt: new Date(),
        processedBy: req.user.id
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
