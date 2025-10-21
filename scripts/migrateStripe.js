const { executeQuery, testConnection } = require('../config/database');

async function runStripeMigrations() {
  try {
    console.log('🚀 Début des migrations Stripe...');

    // Test de connexion
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Impossible de se connecter à la base de données');
      process.exit(1);
    }

    // Ajouter les colonnes Stripe à la table payments
    console.log('📝 Ajout des colonnes Stripe à la table payments...');

    try {
      await executeQuery(`
        ALTER TABLE payments
        ADD COLUMN stripe_payment_intent_id VARCHAR(255),
        ADD COLUMN stripe_customer_id VARCHAR(255)
      `);
      console.log('✅ Colonnes Stripe ajoutées à la table payments');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Les colonnes Stripe existent déjà dans la table payments');
      } else {
        throw error;
      }
    }

    // Ajouter les index pour optimiser les performances
    console.log('📝 Ajout des index Stripe...');

    try {
      await executeQuery(`
        ALTER TABLE payments
        ADD INDEX idx_stripe_payment_intent (stripe_payment_intent_id),
        ADD INDEX idx_stripe_customer (stripe_customer_id)
      `);
      console.log('✅ Index Stripe ajoutés');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        console.log('ℹ️ Les index Stripe existent déjà');
      } else {
        throw error;
      }
    }

    console.log('✅ Migrations Stripe terminées avec succès !');
    console.log('📊 Modifications apportées :');
    console.log('   - Colonnes ajoutées à payments : stripe_payment_intent_id, stripe_customer_id');
    console.log('   - Index ajoutés pour optimiser les performances');
    console.log('');
    console.log('🔧 Prochaines étapes :');
    console.log('   1. Ajouter STRIPE_SECRET_KEY dans votre fichier .env');
    console.log('   2. Ajouter STRIPE_WEBHOOK_SECRET dans votre fichier .env');
    console.log('   3. Configurer les webhooks dans votre dashboard Stripe');

  } catch (error) {
    console.error('❌ Erreur lors des migrations Stripe:', error);
    process.exit(1);
  }
}

// Exécuter les migrations si le script est appelé directement
if (require.main === module) {
  runStripeMigrations().then(() => {
    console.log('🎉 Migrations Stripe terminées !');
    process.exit(0);
  }).catch((error) => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = { runStripeMigrations };