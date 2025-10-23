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
   * Trouver ou créer un utilisateur Facebook
   */
  async findOrCreateFacebookUser(facebookData, executeQuery) {
    try {
      const { facebook_id, name, email, picture_url } = facebookData;

      // D'abord, chercher par facebook_id
      let users = await executeQuery(
        'SELECT * FROM users WHERE facebook_id = ?',
        [facebook_id]
      );

      if (users.length > 0) {
        console.log('✅ Utilisateur Facebook existant trouvé');
        return users[0];
      }

      // Si pas trouvé par facebook_id, chercher par email (si disponible)
      if (email) {
        users = await executeQuery(
          'SELECT * FROM users WHERE email = ?',
          [email]
        );

        if (users.length > 0) {
          // Lier le compte existant avec Facebook
          await executeQuery(
            'UPDATE users SET facebook_id = ?, profile_picture_url = ? WHERE id = ?',
            [facebook_id, picture_url, users[0].id]
          );
          
          console.log('✅ Compte existant lié avec Facebook');
          return { ...users[0], facebook_id, profile_picture_url: picture_url };
        }
      }

      // Créer un nouvel utilisateur (email peut être null)
      const [firstName, ...lastNameParts] = (name || 'Utilisateur Facebook').split(' ');
      const lastName = lastNameParts.join(' ') || '';
      
      // Générer un email temporaire unique avec timestamp
      const tempEmail = email || `facebook_${facebook_id}_${Date.now()}@parky.temp`;

      console.log('📝 Création utilisateur avec:', { tempEmail, firstName, lastName, facebook_id });

      try {
        const result = await executeQuery(
          `INSERT INTO users (
            email, first_name, last_name, facebook_id, profile_picture_url, 
            role, is_verified, created_at
          ) VALUES (?, ?, ?, ?, ?, 'client', 1, NOW())`,
          [tempEmail, firstName, lastName, facebook_id, picture_url]
        );

        const newUser = await executeQuery(
          'SELECT * FROM users WHERE id = ?',
          [result.insertId]
        );

        console.log('✅ Nouvel utilisateur Facebook créé avec ID:', result.insertId);
        return newUser[0];
        
      } catch (insertError) {
        console.error('❌ Erreur insertion SQL:', insertError);
        
        // Si erreur de duplication, essayer de récupérer l'utilisateur existant
        if (insertError.code === 'ER_DUP_ENTRY') {
          console.log('📋 Utilisateur semble exister, tentative de récupération...');
          
          const existingUser = await executeQuery(
            'SELECT * FROM users WHERE facebook_id = ?',
            [facebook_id]
          );
          
          if (existingUser.length > 0) {
            console.log('✅ Utilisateur Facebook existant récupéré');
            return existingUser[0];
          }
        }
        
        throw insertError;
      }

    } catch (error) {
      console.error('❌ Erreur création utilisateur Facebook:', error);
      throw new Error('Erreur lors de la création de l\'utilisateur Facebook');
    }
  }

  /**
   * Générer la réponse d'authentification
   */
  generateAuthResponse(user, generateToken) {
    const token = generateToken(user);
    
    return {
      success: true,
      message: 'Connexion Facebook réussie',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        role: user.role,
        profile_picture_url: user.profile_picture_url,
        facebook_id: user.facebook_id,
        is_verified: user.is_verified
      },
      token
    };
  }

  /**
   * Extraire le prénom du nom complet
   */
  _extractFirstName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    return parts[0] || '';
  }

  /**
   * Extraire le nom de famille du nom complet
   */
  _extractLastName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    return parts.slice(1).join(' ') || '';
  }
}

module.exports = new FacebookAuthService();