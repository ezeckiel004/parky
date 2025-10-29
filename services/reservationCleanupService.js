const { executeQuery } = require('../config/database');

class ReservationCleanupService {
  // Nettoyer les réservations non payées après expiration
  static async cleanupExpiredReservations() {
    try {
      // Définir le délai d'expiration (15 minutes)
      const expirationMinutes = 15;
      
      // Trouver les réservations 'pending' expirées
      const expiredReservations = await executeQuery(
        `SELECT id, space_id 
         FROM reservations 
         WHERE status = 'pending' 
         AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
        [expirationMinutes]
      );

      if (expiredReservations.length === 0) {
        console.log('✅ Aucune réservation expirée à nettoyer');
        return { cleaned: 0 };
      }

      console.log(`🧹 Nettoyage de ${expiredReservations.length} réservations expirées...`);

      // Marquer les réservations comme expirées
      for (const reservation of expiredReservations) {
        await executeQuery(
          'UPDATE reservations SET status = "expired", expired_at = NOW() WHERE id = ?',
          [reservation.id]
        );

        // La place reste disponible car elle n'était pas marquée comme occupée
        console.log(`📝 Réservation ${reservation.id} marquée comme expirée`);
      }

      console.log(`✅ ${expiredReservations.length} réservations nettoyées`);
      return { cleaned: expiredReservations.length };

    } catch (error) {
      console.error('❌ Erreur lors du nettoyage des réservations:', error);
      throw error;
    }
  }

  // Démarrer le nettoyage automatique (à appeler au démarrage du serveur)
  static startCleanupScheduler() {
    // Nettoyer toutes les 5 minutes
    const cleanupInterval = 5 * 60 * 1000; // 5 minutes en millisecondes

    setInterval(() => {
      console.log('🧹 Démarrage du nettoyage automatique des réservations...');
      this.cleanupExpiredReservations()
        .then(result => {
          if (result.cleaned > 0) {
            console.log(`🎯 Nettoyage automatique terminé: ${result.cleaned} réservations expirées supprimées`);
          }
        })
        .catch(error => {
          console.error('❌ Erreur nettoyage automatique:', error);
        });
    }, cleanupInterval);

    console.log(`🕐 Nettoyage automatique des réservations programmé toutes les ${cleanupInterval / 60000} minutes`);
  }

  // Vérifier le temps restant pour une réservation pending
  static async getReservationTimeRemaining(reservationId) {
    try {
      const reservation = await executeQuery(
        `SELECT id, status, created_at,
         TIMESTAMPDIFF(MINUTE, created_at, NOW()) as minutes_elapsed
         FROM reservations 
         WHERE id = ?`,
        [reservationId]
      );

      if (reservation.length === 0) {
        return { found: false };
      }

      const reservationData = reservation[0];
      
      if (reservationData.status !== 'pending') {
        return { 
          found: true, 
          status: reservationData.status, 
          expired: false 
        };
      }

      const expirationMinutes = 15;
      const minutesElapsed = reservationData.minutes_elapsed;
      const minutesRemaining = expirationMinutes - minutesElapsed;

      return {
        found: true,
        status: 'pending',
        expired: minutesRemaining <= 0,
        minutesRemaining: Math.max(0, minutesRemaining),
        minutesElapsed: minutesElapsed
      };

    } catch (error) {
      console.error('❌ Erreur vérification temps restant:', error);
      throw error;
    }
  }
}

module.exports = ReservationCleanupService;