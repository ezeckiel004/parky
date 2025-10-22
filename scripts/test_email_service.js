const emailService = require('../services/emailService');

async function testEmailService() {
  console.log('🧪 Test du service email...');

  try {
    // Test simple d'envoi d'email
    const result = await emailService.sendEmail(
      'test@example.com', 
      'Test Parky - Service Email',
      emailService.generateEmailTemplate(
        'Test du Service Email',
        '<p>Ceci est un email de test pour vérifier que le service fonctionne correctement.</p>'
      )
    );

    if (result.success) {
      console.log('✅ Service email configuré et fonctionnel');
      console.log(`📧 Message ID: ${result.messageId}`);
    } else {
      console.log('❌ Erreur lors du test:', result.error);
    }
  } catch (error) {
    console.error('❌ Erreur lors du test email:', error.message);
  }
}

// Exécuter le test si appelé directement
if (require.main === module) {
  testEmailService().then(() => {
    console.log('🏁 Test terminé');
    process.exit(0);
  });
}

module.exports = testEmailService;