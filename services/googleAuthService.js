const { OAuth2Client } = require('google-auth-library');

class GoogleAuthService {
  constructor() {
    // ID client Google OAuth2 (à configurer dans .env)
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    
    if (!this.clientId) {
      console.warn('⚠️  GOOGLE_CLIENT_ID non configuré dans .env');
      this.disabled = true;
      return;
    }
    
    this.client = new OAuth2Client(this.clientId);
    this.disabled = false;
    console.log('✅ Service Google Auth configuré');
  }

  /**
   * Vérifier et décoder un token Google ID
   * @param {string} idToken - Token ID Google provenant du client
   * @returns {Object} - Informations de l'utilisateur Google
   */
  async verifyGoogleToken(idToken) {
    if (this.disabled) {
      throw new Error('Service Google Auth non configuré');
    }

    try {
      // Vérifier le token avec Google
      const ticket = await this.client.verifyIdToken({
        idToken: idToken,
        audience: this.clientId,
      });

      const payload = ticket.getPayload();
      
      // Extraire les informations utilisateur
      return {
        googleId: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
        firstName: payload.given_name,
        lastName: payload.family_name,
        fullName: payload.name,
        picture: payload.picture,
        locale: payload.locale,
      };
    } catch (error) {
      console.error('❌ Erreur vérification token Google:', error.message);
      throw new Error('Token Google invalide');
    }
  }

  /**
   * Créer ou récupérer un utilisateur basé sur les données Google
   * @param {Object} googleData - Données utilisateur Google
   * @param {Function} executeQuery - Fonction de requête DB
   * @returns {Object} - Utilisateur avec informations complètes
   */
  async findOrCreateGoogleUser(googleData, executeQuery) {
    const { googleId, email, firstName, lastName, picture } = googleData;

    try {
      // Chercher un utilisateur existant par email ou google_id
      let existingUser = await executeQuery(
        'SELECT * FROM users WHERE email = ? OR google_id = ?',
        [email, googleId]
      );

      if (existingUser.length > 0) {
        const user = existingUser[0];
        
        // Mettre à jour google_id si pas encore associé
        if (!user.google_id) {
          await executeQuery(
            'UPDATE users SET google_id = ?, profile_picture = ?, updated_at = NOW() WHERE id = ?',
            [googleId, picture, user.id]
          );
        }
        
        // Mettre à jour la dernière connexion
        await executeQuery(
          'UPDATE users SET last_login = NOW() WHERE id = ?',
          [user.id]
        );

        console.log(`✅ Connexion Google réussie pour: ${email}`);
        return { ...user, google_id: googleId, profile_picture: picture };
      }

      // Créer un nouvel utilisateur
      const result = await executeQuery(
        `INSERT INTO users (
          email, 
          first_name, 
          last_name, 
          google_id, 
          profile_picture, 
          role, 
          status, 
          email_verified, 
          created_at,
          last_login
        ) VALUES (?, ?, ?, ?, ?, 'client', 'active', 1, NOW(), NOW())`,
        [email, firstName, lastName || '', googleId, picture]
      );

      // Récupérer l'utilisateur créé
      const newUser = await executeQuery(
        'SELECT * FROM users WHERE id = ?',
        [result.insertId]
      );

      console.log(`✅ Nouvel utilisateur Google créé: ${email}`);
      return newUser[0];

    } catch (error) {
      console.error('❌ Erreur création/récupération utilisateur Google:', error);
      throw error;
    }
  }

  /**
   * Générer les données de réponse pour l'authentification Google
   * @param {Object} user - Utilisateur de la DB
   * @param {Function} generateToken - Fonction de génération de token JWT
   * @returns {Object} - Réponse complète avec token
   */
  generateAuthResponse(user, generateToken) {
    // Générer le token JWT
    const token = generateToken(user.id, user.email, user.role);

    // Retourner les informations sans le mot de passe
    const { password, reset_token, reset_token_expiry, ...userWithoutSensitiveData } = user;

    return {
      message: 'Connexion Google réussie',
      user: userWithoutSensitiveData,
      token,
      authMethod: 'google'
    };
  }
}

// Créer une instance unique du service
const googleAuthService = new GoogleAuthService();

module.exports = googleAuthService;