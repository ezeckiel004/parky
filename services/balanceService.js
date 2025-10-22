const { executeQuery } = require('../config/database');

const PARKY_COMMISSION_RATE = 0.15; // 15% de commission

class BalanceService {
  // Calculer les revenus du propriétaire après commission
  static calculateOwnerEarning(totalAmount) {
    const parkyFee = totalAmount * PARKY_COMMISSION_RATE;
    const ownerEarning = totalAmount - parkyFee;

    return {
      totalAmount: parseFloat(totalAmount),
      parkyFee: parseFloat(parkyFee.toFixed(2)),
      ownerEarning: parseFloat(ownerEarning.toFixed(2))
    };
  }

  // Mettre à jour la balance du propriétaire après un paiement
  static async updateOwnerBalance(reservationId) {
    try {
      console.log(`Mise à jour balance pour réservation ${reservationId}`);

      // Récupérer les détails de la réservation et du propriétaire
      const reservation = await executeQuery(`
        SELECT
          r.id as reservation_id,
          r.total_amount,
          r.user_id as client_id,
          park.owner_id,
          u.first_name as owner_name,
          u.last_name as owner_lastname,
          park.name as parking_name
        FROM reservations r
        JOIN parking_spaces ps ON r.space_id = ps.id
        JOIN parkings park ON ps.parking_id = park.id
        JOIN users u ON park.owner_id = u.id
        WHERE r.id = ?
      `, [reservationId]);

      if (reservation.length === 0) {
        throw new Error(`Réservation ${reservationId} non trouvée`);
      }

      const { total_amount, owner_id, parking_name } = reservation[0];
      const { parkyFee, ownerEarning } = this.calculateOwnerEarning(total_amount);

      console.log(`Réservation ${reservationId}: ${total_amount}€ -> Propriétaire: ${ownerEarning}€, Commission: ${parkyFee}€`);

      // Utiliser une transaction pour assurer la cohérence
      const queries = [
        // 1. Créer la transaction d'earning pour le propriétaire
        {
          query: `
            INSERT INTO balance_transactions
            (owner_id, reservation_id, type, amount, description, status)
            VALUES (?, ?, 'earning', ?, ?, 'completed')
          `,
          params: [
            owner_id,
            reservationId,
            ownerEarning,
            `Revenus réservation #${reservationId} - ${parking_name}`
          ]
        },
        // 2. Créer la transaction de commission Parky (montant négatif)
        {
          query: `
            INSERT INTO balance_transactions
            (owner_id, reservation_id, type, amount, description, status)
            VALUES (?, ?, 'fee', ?, ?, 'completed')
          `,
          params: [
            owner_id,
            reservationId,
            -parkyFee,
            `Commission Parky (${Math.round(PARKY_COMMISSION_RATE * 100)}%) - Réservation #${reservationId}`
          ]
        },
        // 3. Mettre à jour la balance du propriétaire
        {
          query: `
            INSERT INTO owner_balances (owner_id, current_balance, total_earned, last_transaction_at)
            VALUES (?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
              current_balance = current_balance + ?,
              total_earned = total_earned + ?,
              last_transaction_at = NOW()
          `,
          params: [owner_id, ownerEarning, ownerEarning, ownerEarning, ownerEarning]
        }
      ];

      // Exécuter toutes les requêtes en transaction
      for (const { query, params } of queries) {
        await executeQuery(query, params);
      }

      console.log(`✅ Balance mise à jour pour propriétaire ${owner_id}: +${ownerEarning}€`);

      return {
        owner_id,
        ownerEarning,
        parkyFee,
        totalAmount: total_amount
      };

    } catch (error) {
      console.error('❌ Erreur mise à jour balance:', error);
      throw error;
    }
  }

  // Récupérer la balance d'un propriétaire
  static async getOwnerBalance(ownerId) {
    try {
      const balance = await executeQuery(`
        SELECT
          current_balance,
          pending_balance,
          total_earned,
          last_transaction_at,
          created_at
        FROM owner_balances
        WHERE owner_id = ?
      `, [ownerId]);

      if (balance.length === 0) {
        // Créer la balance si elle n'existe pas
        await executeQuery(`
          INSERT INTO owner_balances (owner_id, current_balance, total_earned)
          VALUES (?, 0.00, 0.00)
        `, [ownerId]);

        return {
          current_balance: 0.00,
          pending_balance: 0.00,
          total_earned: 0.00,
          last_transaction_at: null,
          created_at: new Date()
        };
      }

      return balance[0];
    } catch (error) {
      console.error('Erreur récupération balance:', error);
      throw error;
    }
  }

  // Récupérer l'historique des transactions d'un propriétaire
  static async getOwnerTransactions(ownerId, page = 1, limit = 10) {
    try {
      // Conversion sécurisée en entiers
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const offset = (pageNum - 1) * limitNum;

      const transactions = await executeQuery(`
        SELECT
          bt.*,
          r.start_time,
          r.end_time,
          r.vehicle_plate,
          p.name as parking_name,
          ps.space_number
        FROM balance_transactions bt
        LEFT JOIN reservations r ON bt.reservation_id = r.id
        LEFT JOIN parking_spaces ps ON r.space_id = ps.id
        LEFT JOIN parkings p ON ps.parking_id = p.id
        WHERE bt.owner_id = ?
        ORDER BY bt.created_at DESC
        LIMIT ? OFFSET ?
      `, [ownerId, limitNum, offset]);

      const totalResult = await executeQuery(
        'SELECT COUNT(*) as total FROM balance_transactions WHERE owner_id = ?',
        [ownerId]
      );

      return {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalResult[0].total,
          pages: Math.ceil(totalResult[0].total / limit)
        }
      };
    } catch (error) {
      console.error('Erreur récupération transactions:', error);
      throw error;
    }
  }

  // Statistiques de revenus pour un propriétaire
  static async getOwnerStats(ownerId, period = 'month') {
    try {
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
      const stats = await executeQuery(`
        SELECT
          COUNT(CASE WHEN type = 'earning' THEN 1 END) as total_reservations,
          SUM(CASE WHEN type = 'earning' THEN amount ELSE 0 END) as total_earnings,
          SUM(CASE WHEN type = 'fee' THEN ABS(amount) ELSE 0 END) as total_fees,
          AVG(CASE WHEN type = 'earning' THEN amount ELSE NULL END) as avg_earning_per_reservation
        FROM balance_transactions
        WHERE owner_id = ? AND created_at >= ? AND status = 'completed'
      `, [ownerId, startDate]);

      // Revenus par jour
      const dailyEarnings = await executeQuery(`
        SELECT
          DATE(created_at) as date,
          SUM(CASE WHEN type = 'earning' THEN amount ELSE 0 END) as daily_earnings,
          COUNT(CASE WHEN type = 'earning' THEN 1 END) as daily_reservations
        FROM balance_transactions
        WHERE owner_id = ? AND created_at >= ? AND status = 'completed'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `, [ownerId, startDate]);

      // Balance actuelle
      const balance = await this.getOwnerBalance(ownerId);

      return {
        period,
        balance,
        stats: stats[0],
        dailyEarnings
      };
    } catch (error) {
      console.error('Erreur récupération statistiques:', error);
      throw error;
    }
  }

  // Traiter un remboursement
  static async processRefund(reservationId, refundAmount, reason = 'Remboursement client') {
    try {
      // Récupérer les informations de la réservation
      const reservation = await executeQuery(`
        SELECT
          r.id as reservation_id,
          r.total_amount,
          p.owner_id,
          park.name as parking_name
        FROM reservations r
        JOIN parking_spaces ps ON r.space_id = ps.id
        JOIN parkings park ON ps.parking_id = park.id
        WHERE r.id = ?
      `, [reservationId]);

      if (reservation.length === 0) {
        throw new Error('Réservation non trouvée');
      }

      const { owner_id, parking_name } = reservation[0];
      const { ownerEarning: originalOwnerEarning } = this.calculateOwnerEarning(refundAmount);

      // Créer la transaction de remboursement (montant négatif)
      await executeQuery(`
        INSERT INTO balance_transactions
        (owner_id, reservation_id, type, amount, description, status)
        VALUES (?, ?, 'refund', ?, ?, 'completed')
      `, [
        owner_id,
        reservationId,
        -originalOwnerEarning,
        `${reason} - Réservation #${reservationId} - ${parking_name}`
      ]);

      // Mettre à jour la balance
      await executeQuery(`
        UPDATE owner_balances
        SET current_balance = current_balance - ?,
            last_transaction_at = NOW()
        WHERE owner_id = ?
      `, [originalOwnerEarning, owner_id]);

      console.log(`Remboursement traité pour propriétaire ${owner_id}: -${originalOwnerEarning}€`);

      return {
        owner_id,
        refundAmount: originalOwnerEarning,
        reason
      };

    } catch (error) {
      console.error('Erreur traitement remboursement:', error);
      throw error;
    }
  }
}

module.exports = BalanceService;