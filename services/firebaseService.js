const admin = require('firebase-admin');

class FirebaseService {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialiser Firebase Admin SDK
   */
  initialize() {
    if (this.initialized) return;

    try {
      // Option 1: Utiliser le fichier de clé de service
      if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID
        });
      } 
      // Option 2: Utiliser les variables d'environnement
      else if (process.env.FIREBASE_PRIVATE_KEY) {
        const serviceAccount = {
          type: "service_account",
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token"
        };

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID
        });
      }
      // Option 3: Fallback vers le fichier local
      else {
        const path = require('path');
        const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id
        });
      }

      this.initialized = true;
      console.log('✅ Firebase Admin SDK initialisé');
    } catch (error) {
      console.error('❌ Erreur initialisation Firebase:', error.message);
      throw error;
    }
  }

  /**
   * Envoyer une notification à un utilisateur spécifique
   */
  async sendNotificationToUser(userId, notification) {
    try {
      this.initialize();

      const message = {
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: notification.data || {},
        topic: `user_${userId}` // Topic par utilisateur
      };

      const response = await admin.messaging().send(message);
      console.log('✅ Notification envoyée:', response);
      return response;
    } catch (error) {
      console.error('❌ Erreur envoi notification:', error);
      throw error;
    }
  }

  /**
   * Envoyer une notification à un token spécifique
   */
  async sendNotificationToToken(fcmToken, notification, userId = null) {
    try {
      this.initialize();

      // Convertir toutes les valeurs data en strings (exigence Firebase)
      const stringData = {};
      if (notification.data && typeof notification.data === 'object') {
        Object.keys(notification.data).forEach(key => {
          const value = notification.data[key];
          if (value !== null && value !== undefined) {
            stringData[key] = typeof value === 'string' ? value : JSON.stringify(value);
          }
        });
      }

      const message = {
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: stringData,
        token: fcmToken
      };

      const response = await admin.messaging().send(message);
      console.log('✅ Notification envoyée au token:', response);
      return response;
    } catch (error) {
      console.error('❌ Erreur envoi notification au token:', error);
      
      // Gérer les tokens invalides
      if (error.code === 'messaging/registration-token-not-registered' || 
          error.code === 'messaging/invalid-registration-token') {
        console.log('🧹 Token FCM invalide détecté, nettoyage en cours...');
        await this._cleanInvalidToken(fcmToken, userId);
      }
      
      throw error;
    }
  }

  /**
   * Nettoyer un token FCM invalide de la base de données
   */
  async _cleanInvalidToken(fcmToken, userId = null) {
    try {
      const { executeQuery } = require('../config/database');
      
      if (userId) {
        // Nettoyer pour un utilisateur spécifique
        await executeQuery(
          'UPDATE users SET fcm_token = NULL WHERE id = ? AND fcm_token = ?',
          [userId, fcmToken]
        );
        console.log(`✅ Token FCM invalide supprimé pour l'utilisateur ${userId}`);
      } else {
        // Nettoyer tous les utilisateurs avec ce token
        const result = await executeQuery(
          'UPDATE users SET fcm_token = NULL WHERE fcm_token = ?',
          [fcmToken]
        );
        console.log(`✅ Token FCM invalide supprimé pour ${result.affectedRows} utilisateur(s)`);
      }
    } catch (dbError) {
      console.error('❌ Erreur lors du nettoyage du token invalide:', dbError);
    }
  }

  /**
   * Envoyer une notification à plusieurs utilisateurs
   */
  async sendNotificationToMultiple(userIds, notification) {
    try {
      this.initialize();

      const promises = userIds.map(userId => 
        this.sendNotificationToUser(userId, notification)
      );

      const results = await Promise.allSettled(promises);
      return results;
    } catch (error) {
      console.error('❌ Erreur envoi notifications multiples:', error);
      throw error;
    }
  }

  /**
   * Souscrire un utilisateur à un topic
   */
  async subscribeToTopic(fcmTokens, topic) {
    try {
      this.initialize();

      const tokens = Array.isArray(fcmTokens) ? fcmTokens : [fcmTokens];
      const response = await admin.messaging().subscribeToTopic(tokens, topic);
      console.log('✅ Souscription au topic réussie:', response);
      return response;
    } catch (error) {
      console.error('❌ Erreur souscription topic:', error);
      throw error;
    }
  }

  /**
   * Désouscrire un utilisateur d'un topic
   */
  async unsubscribeFromTopic(fcmTokens, topic) {
    try {
      this.initialize();

      const tokens = Array.isArray(fcmTokens) ? fcmTokens : [fcmTokens];
      const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);
      console.log('✅ Désouscription du topic réussie:', response);
      return response;
    } catch (error) {
      console.error('❌ Erreur désouscription topic:', error);
      throw error;
    }
  }
}

module.exports = new FirebaseService();