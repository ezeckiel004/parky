// Route d'authentification Facebook - VERSION ROBUSTE
router.post('/facebook-robust', [
  body('facebook_token').notEmpty().withMessage('Token Facebook requis'),
  body('facebook_id').notEmpty().withMessage('ID Facebook requis'),
  body('first_name').optional().trim(),
  body('last_name').optional().trim()
], async (req, res, next) => {
  try {
    console.log('🚀 Début authentification Facebook robuste');
    console.log('📥 Données reçues:', {
      facebook_id: req.body.facebook_id,
      facebook_token: req.body.facebook_token ? '[TOKEN_PRESENT]' : '[NO_TOKEN]',
      first_name: req.body.first_name,
      last_name: req.body.last_name
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Erreurs de validation:', errors.array());
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Données requises manquantes',
        details: errors.array()
      });
    }

    const { facebook_token, facebook_id, first_name, last_name, profile_picture_url } = req.body;

    // Vérifier le token Facebook
    console.log('🔐 Vérification token Facebook...');
    const facebookData = await facebookAuthService.verifyFacebookToken(facebook_token);
    
    // Vérifier que l'ID Facebook correspond
    if (facebookData.facebook_id !== facebook_id) {
      console.log('❌ ID Facebook ne correspond pas:', {
        received: facebook_id,
        fromToken: facebookData.facebook_id
      });
      return res.status(401).json({
        error: 'Token invalide',
        message: 'L\'ID Facebook ne correspond pas au token fourni'
      });
    }

    console.log('✅ Token Facebook validé avec succès');

    // Utiliser les données du front-end si disponibles, sinon celles de Facebook
    const userData = {
      facebook_id: facebook_id,
      name: `${first_name || ''} ${last_name || ''}`.trim() || facebookData.name,
      email: null, // Pas d'email pour éviter les problèmes
      picture_url: profile_picture_url || facebookData.picture_url
    };
    
    console.log('👤 Données utilisateur préparées:', userData);

    // Créer ou récupérer l'utilisateur
    console.log('🔍 Recherche/création utilisateur...');
    const user = await facebookAuthService.findOrCreateFacebookUser(userData, executeQuery);
    
    console.log('✅ Utilisateur obtenu:', {
      id: user.id,
      email: user.email,
      facebook_id: user.facebook_id
    });

    // Générer la réponse avec token JWT
    const authResponse = facebookAuthService.generateAuthResponse(user, generateToken);
    
    console.log('🎉 Authentification Facebook robuste réussie');
    res.json(authResponse);

  } catch (error) {
    console.error('❌ ERREUR COMPLETE authentification Facebook robuste:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.message === 'Token Facebook invalide') {
      return res.status(401).json({
        error: 'Token invalide',
        message: 'Le token Facebook fourni est invalide ou expiré'
      });
    }
    
    if (error.message.includes('Impossible de créer l\'utilisateur')) {
      return res.status(500).json({
        error: 'Erreur création utilisateur',
        message: 'Impossible de créer l\'utilisateur Facebook après plusieurs tentatives',
        details: error.message
      });
    }
    
    // Erreur générique
    return res.status(500).json({
      error: 'Erreur serveur',
      message: 'Erreur interne du serveur lors de l\'authentification Facebook',
      details: error.message
    });
  }
});