const { executeQuery } = require('../config/database');
const firebaseService = require('./firebaseService');

class NotificationService {

  /**
   * Mapper les types spécifiques vers les enum de base
   */
  _mapNotificationType(specificType) {
    const typeMapping = {
      // Types réservation
      'NEW_RESERVATION': 'reservation',
      'RESERVATION_CONFIRMED': 'reservation',
      'RESERVATION_CANCELLED': 'reservation',
      'RESERVATION_REMINDER': 'reservation',
      
      // Types paiement
      'PAYMENT_SUCCESS': 'payment',
      'PAYMENT_FAILED': 'payment',
      
      // Types système
      'PARKING_ISSUE': 'system',
      'ACCOUNT_WARNING': 'system',
      'WITHDRAWAL_REQUEST': 'system',
      'TEST': 'system',
      
      // Types promotion
      'MARKETING': 'promotion'
    };
    
    return typeMapping[specificType] || 'system';
  }

  /**
   * Nettoyer et formater les données pour FCM (toutes les valeurs doivent être des strings)
   */
  _sanitizeDataForFCM(data) {
    const sanitizedData = {};
    
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (value !== null && value !== undefined) {
          // Convertir en string si ce n'est pas déjà le cas
          sanitizedData[key] = typeof value === 'string' ? value : String(value);
        }
      });
    }
    
    return sanitizedData;
  }

  /**
   * Envoyer une notification et la sauvegarder en base
   */
  async sendNotification({
    userId,
    title,
    body,
    type,
    data = {},
    relatedId = null
  }) {
    try {
      // 1. Sauvegarder en base de données (adapter au schéma existant)
      const dbType = this._mapNotificationType(type);
      const result = await executeQuery(
        `INSERT INTO notifications (
          user_id, title, message, type, data
        ) VALUES (?, ?, ?, ?, ?)`,
        [userId, title, body, dbType, JSON.stringify({...data, specificType: type})]
      );

      const notificationId = result.insertId;

      // 2. Obtenir le FCM token de l'utilisateur
      const userTokens = await executeQuery(
        'SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL',
        [userId]
      );

      // 3. Envoyer la notification push si token disponible
      if (userTokens.length > 0) {
        const fcmToken = userTokens[0].fcm_token;
        
        try {
          // Nettoyer les données pour FCM
          const fcmData = this._sanitizeDataForFCM({
            ...data,
            notificationId: notificationId.toString(),
            type: type.toString()
          });

          await firebaseService.sendNotificationToToken(fcmToken, {
            title,
            body,
            data: fcmData
          }, userId); // Passer l'userId pour le nettoyage automatique
        } catch (fcmError) {
          console.error('❌ Erreur Firebase FCM (notification sauvegardée):', fcmError.message);
        }
      }

      return { success: true, notificationId };
    } catch (error) {
      console.error('❌ Erreur envoi notification:', error);
      throw error;
    }
  }

  /**
   * Notifications pour les réservations
   */
  async sendReservationNotifications(reservationData, type) {
    console.log(`🔔 Envoi notification réservation - Type: ${type}`);
    console.log(`📊 Données reçues:`, {
      ownerId: reservationData.ownerId,
      clientName: reservationData.clientName,
      parkingName: reservationData.parkingName,
      reservationId: reservationData.reservationId
    });

    const notifications = [];

    switch (type) {
      case 'NEW_RESERVATION':
        console.log(`➡️ Envoi notification "Nouvelle réservation" au propriétaire (ID: ${reservationData.ownerId})`);
        // Client → Propriétaire
        notifications.push(this.sendNotification({
          userId: reservationData.ownerId,
          title: '🚗 Nouvelle réservation',
          body: `${reservationData.clientName} a réservé une place dans ${reservationData.parkingName}`,
          type: 'RESERVATION_NEW',
          data: {
            reservationId: reservationData.reservationId,
            parkingId: reservationData.parkingId,
            clientId: reservationData.clientId
          },
          relatedId: reservationData.reservationId
        }));
        break;

      case 'RESERVATION_CONFIRMED':
        // Propriétaire → Client
        notifications.push(this.sendNotification({
          userId: reservationData.clientId,
          title: '✅ Réservation confirmée',
          body: `Votre réservation pour ${reservationData.parkingName} est confirmée`,
          type: 'RESERVATION_CONFIRMED',
          data: {
            reservationId: reservationData.reservationId,
            parkingId: reservationData.parkingId
          },
          relatedId: reservationData.reservationId
        }));
        break;

      case 'RESERVATION_CANCELLED':
        // Client → Propriétaire
        notifications.push(this.sendNotification({
          userId: reservationData.ownerId,
          title: '❌ Réservation annulée',
          body: `${reservationData.clientName} a annulé sa réservation`,
          type: 'RESERVATION_CANCELLED',
          data: {
            reservationId: reservationData.reservationId,
            parkingId: reservationData.parkingId,
            clientId: reservationData.clientId
          },
          relatedId: reservationData.reservationId
        }));
        break;

      case 'RESERVATION_REMINDER':
        // Système → Client
        notifications.push(this.sendNotification({
          userId: reservationData.clientId,
          title: '⏰ Rappel de réservation',
          body: `Votre réservation commence dans 30 minutes`,
          type: 'RESERVATION_REMINDER',
          data: {
            reservationId: reservationData.reservationId,
            parkingId: reservationData.parkingId
          },
          relatedId: reservationData.reservationId
        }));
        break;

      default:
        console.log(`⚠️ Type de notification réservation non géré: ${type}`);
        return Promise.resolve([]);
    }

    console.log(`📤 ${notifications.length} notification(s) à envoyer`);
    return Promise.allSettled(notifications);
  }

  /**
   * Notifications pour les propriétaires vers admin
   */
  async sendOwnerToAdminNotification(ownerData, type) {
    // Obtenir tous les admins
    const admins = await executeQuery(
      'SELECT id FROM users WHERE role = "admin"'
    );

    const notifications = [];

    switch (type) {
      case 'WITHDRAWAL_REQUEST':
        admins.forEach(admin => {
          notifications.push(this.sendNotification({
            userId: admin.id,
            title: '💰 Demande de retrait',
            body: `${ownerData.ownerName} demande un retrait de ${ownerData.amount}€`,
            type: 'WITHDRAWAL_REQUEST',
            data: {
              ownerId: ownerData.ownerId,
              amount: ownerData.amount,
              requestId: ownerData.requestId
            },
            relatedId: ownerData.requestId
          }));
        });
        break;

      case 'PARKING_ISSUE':
        admins.forEach(admin => {
          notifications.push(this.sendNotification({
            userId: admin.id,
            title: '⚠️ Problème signalé',
            body: `Problème signalé sur ${ownerData.parkingName}`,
            type: 'PARKING_ISSUE',
            data: {
              ownerId: ownerData.ownerId,
              parkingId: ownerData.parkingId,
              issueId: ownerData.issueId
            },
            relatedId: ownerData.issueId
          }));
        });
        break;
    }

    return Promise.allSettled(notifications);
  }

  /**
   * Notifications d'admin vers propriétaire
   */
  async sendAdminToOwnerNotification(ownerData, type) {
    const notifications = [];

    switch (type) {
      case 'WITHDRAWAL_APPROVED':
        notifications.push(this.sendNotification({
          userId: ownerData.ownerId,
          title: '✅ Retrait approuvé',
          body: `Votre demande de retrait de ${ownerData.amount}€ a été approuvée`,
          type: 'WITHDRAWAL_APPROVED',
          data: {
            amount: ownerData.amount,
            requestId: ownerData.requestId
          },
          relatedId: ownerData.requestId
        }));
        break;

      case 'WITHDRAWAL_REJECTED':
        notifications.push(this.sendNotification({
          userId: ownerData.ownerId,
          title: '❌ Retrait rejeté',
          body: `Votre demande de retrait a été rejetée. Raison: ${ownerData.reason}`,
          type: 'WITHDRAWAL_REJECTED',
          data: {
            amount: ownerData.amount,
            requestId: ownerData.requestId,
            reason: ownerData.reason
          },
          relatedId: ownerData.requestId
        }));
        break;

      case 'ACCOUNT_WARNING':
        notifications.push(this.sendNotification({
          userId: ownerData.ownerId,
          title: '⚠️ Avertissement',
          body: ownerData.message,
          type: 'ACCOUNT_WARNING',
          data: {
            reason: ownerData.reason
          }
        }));
        break;
    }

    return Promise.allSettled(notifications);
  }

  /**
   * Récupérer les notifications d'un utilisateur
   */
  async getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false }) {
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM notifications 
      WHERE user_id = ?
    `;
    let params = [userId];

    if (unreadOnly) {
      query += ' AND is_read = 0';
    }

    // Intégrer LIMIT et OFFSET directement dans la requête (pas en paramètres préparés)
    const safeLimit = Number.isInteger(parseInt(limit)) ? parseInt(limit) : 20;
    const safeOffset = Number.isInteger(parseInt(offset)) ? parseInt(offset) : 0;

    query += ` ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const notifications = await executeQuery(query, params);
    
    // Compter le total non lues
    const unreadCount = await executeQuery(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    return {
      notifications: notifications.map(notif => ({
        ...notif,
        data: (() => {
          try {
            // Si data est déjà un objet, le retourner tel quel
            if (typeof notif.data === 'object' && notif.data !== null) {
              return notif.data;
            }
            // Si data est une chaîne JSON, la parser
            if (typeof notif.data === 'string' && notif.data.trim() !== '') {
              return JSON.parse(notif.data);
            }
            // Sinon, retourner un objet vide
            return {};
          } catch (error) {
            console.error('❌ Erreur parsing notification data:', error, 'Data:', notif.data);
            return {};
          }
        })()
      })),
      unreadCount: unreadCount[0].count
    };
  }

  /**
   * Marquer une notification comme lue
   */
  async markAsRead(notificationId, userId) {
    await executeQuery(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
  }

  /**
   * Marquer toutes les notifications comme lues
   */
  async markAllAsRead(userId) {
    await executeQuery(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
      [userId]
    );
  }
}

module.exports = new NotificationService();