const axios = require('axios');

class FacebookAuthService {
  
  /**
   * Vérifier le token Facebook avec l'API Facebook
   */
  async verifyFacebookToken(facebookToken) {
    try {
      // Vérifier le token avec l'API Facebook Graph (sans email)
      const response = await axios.get(
        `https://graph.facebook.com/me?access_token=${facebookToken}&fields=id,name,picture.width(200).height(200)`
      );

      if (!response.data || !response.data.id) {
        throw new Error('Token Facebook invalide');
      }

      console.log('✅ Token Facebook validé:', response.data);
      
      return {
        facebook_id: response.data.id,
        name: response.data.name,
        email: null, // Email pas disponible pour l'instant
        picture_url: response.data.picture?.data?.url
      };

    } catch (error) {
      console.error('❌ Erreur validation token Facebook:', error.response?.data || error.message);
      
      if (error.response?.status === 400) {
        throw new Error('Token Facebook invalide');
      }
      
      throw new Error('Erreur lors de la validation du token Facebook');
    }
  }

  /**
   * Trouver ou créer un utilisateur Facebook - VERSION ROBUSTE
   */
  async findOrCreateFacebookUser(facebookData, executeQuery) {
    const { facebook_id, name, email, picture_url } = facebookData;
    
    try {
      console.log('🔍 Recherche utilisateur Facebook ID:', facebook_id);

      // ÉTAPE 1: Chercher par facebook_id
      let users = await executeQuery(
        'SELECT * FROM users WHERE facebook_id = ?',
        [facebook_id]
      );

      if (users.length > 0) {
        console.log('✅ Utilisateur Facebook existant trouvé');
        return users[0];
      }

      // ÉTAPE 2: Préparer les données pour création
      const [firstName, ...lastNameParts] = (name || 'Utilisateur Facebook').split(' ');
      const lastName = lastNameParts.join(' ') || '';
      
      // Email unique avec ID Facebook + timestamp pour éviter conflicts
      const uniqueEmail = `facebook_${facebook_id}_${Date.now()}@parky.temp`;
      
      console.log('📝 Création nouvel utilisateur:', {
        email: uniqueEmail,
        firstName,
        lastName,
        facebook_id,
        picture_url
      });

      // ÉTAPE 3: Insertion avec gestion d'erreur robuste
      try {
        const result = await executeQuery(
          `INSERT INTO users (
            email, first_name, last_name, facebook_id, profile_picture_url, 
            role, created_at
          ) VALUES (?, ?, ?, ?, ?, 'client', NOW())`,
          [uniqueEmail, firstName, lastName, facebook_id, picture_url]
        );

        // Récupérer l'utilisateur créé
        const newUser = await executeQuery(
          'SELECT * FROM users WHERE id = ?',
          [result.insertId]
        );

        console.log('✅ Nouvel utilisateur Facebook créé avec ID:', result.insertId);
        return newUser[0];

      } catch (insertError) {
        console.error('❌ Erreur insertion utilisateur:', insertError);

        // ÉTAPE 4: Fallback - Chercher si l'utilisateur a été créé entre temps
        const fallbackUser = await executeQuery(
          'SELECT * FROM users WHERE facebook_id = ?',
          [facebook_id]
        );

        if (fallbackUser.length > 0) {
          console.log('✅ Utilisateur trouvé après erreur insertion (race condition)');
          return fallbackUser[0];
        }

        // ÉTAPE 5: Dernière tentative avec un email encore plus unique
        const superUniqueEmail = `facebook_${facebook_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@parky.temp`;
        
        try {
          const retryResult = await executeQuery(
            `INSERT INTO users (
              email, first_name, last_name, facebook_id, profile_picture_url, 
              role, created_at
            ) VALUES (?, ?, ?, ?, ?, 'client', NOW())`,
            [superUniqueEmail, firstName, lastName, facebook_id, picture_url]
          );

          const retryUser = await executeQuery(
            'SELECT * FROM users WHERE id = ?',
            [retryResult.insertId]
          );

          console.log('✅ Utilisateur créé après retry avec email super unique');
          return retryUser[0];

        } catch (retryError) {
          console.error('❌ Échec définitif création utilisateur:', retryError);
          throw new Error('Impossible de créer l\'utilisateur Facebook après plusieurs tentatives');
        }
      }

    } catch (error) {
      console.error('❌ Erreur globale findOrCreateFacebookUser:', error);
      throw new Error('Erreur lors de la création de l\'utilisateur Facebook');
    }
  }

  /**
   * Générer la réponse d'authentification
   */
  generateAuthResponse(user, generateToken) {
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role
    });

    return {
      success: true,
      message: 'Authentification Facebook réussie',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        profilePictureUrl: user.profile_picture_url,
        role: user.role,
        facebookId: user.facebook_id
      }
    };
  }
}

module.exports = new FacebookAuthService();