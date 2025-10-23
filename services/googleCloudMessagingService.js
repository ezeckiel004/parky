const { google } = require('googleapis');
const path = require('path');

class GoogleCloudMessagingService {
  
  constructor() {
    this.serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './config/google-service-account.json';
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'parky-475918';
    this.auth = null;
  }

  /**
   * Initialiser l'authentification Google Cloud
   */
  async initialize() {
    try {
      this.auth = new google.auth.GoogleAuth({
        keyFile: this.serviceAccountPath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });

      console.log('✅ Google Cloud Messaging Service initialized');
    } catch (error) {
      console.error('❌ Erreur initialisation Google Cloud Messaging:', error);
      throw error;
    }
  }

  /**
   * Obtenir un access token
   */
  async getAccessToken() {
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();
    return accessToken.token;
  }

  /**
   * Envoyer une notification à un token FCM
   */
  async sendNotificationToToken(fcmToken, { title, body, data = {} }) {
    try {
      const accessToken = await this.getAccessToken();
      
      const message = {
        message: {
          token: fcmToken,
          notification: {
            title,
            body
          },
          data: {
            ...data,
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
          },
          android: {
            notification: {
              channel_id: 'parky_notifications',
              priority: 'high'
            }
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  title,
                  body
                },
                sound: 'default'
              }
            }
          }
        }
      };

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(message)
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`FCM Error: ${response.status} - ${error}`);
      }

      const result = await response.json();
      console.log('✅ Notification envoyée via Google Cloud Messaging:', result.name);
      return result;

    } catch (error) {
      console.error('❌ Erreur envoi notification Google Cloud:', error);
      throw error;
    }
  }

  /**
   * Envoyer à plusieurs tokens
   */
  async sendNotificationToMultipleTokens(tokens, { title, body, data = {} }) {
    const promises = tokens.map(token => 
      this.sendNotificationToToken(token, { title, body, data })
        .catch(error => {
          console.error(`Erreur pour token ${token}:`, error.message);
          return null;
        })
    );

    const results = await Promise.all(promises);
    const successful = results.filter(result => result !== null);
    
    console.log(`✅ ${successful.length}/${tokens.length} notifications envoyées`);
    return {
      successful: successful.length,
      total: tokens.length,
      results
    };
  }

  /**
   * Envoyer à un topic
   */
  async sendNotificationToTopic(topic, { title, body, data = {} }) {
    try {
      const accessToken = await this.getAccessToken();
      
      const message = {
        message: {
          topic,
          notification: {
            title,
            body
          },
          data: {
            ...data,
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
          }
        }
      };

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(message)
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`FCM Topic Error: ${response.status} - ${error}`);
      }

      const result = await response.json();
      console.log('✅ Notification topic envoyée:', topic);
      return result;

    } catch (error) {
      console.error('❌ Erreur envoi notification topic:', error);
      throw error;
    }
  }
}

module.exports = new GoogleCloudMessagingService();