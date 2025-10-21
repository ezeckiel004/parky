const { executeQuery, testConnection } = require('../config/database');

async function runBalanceMigrations() {
  try {
    console.log('🚀 Début des migrations pour le système de balances...');

    // Test de connexion
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Impossible de se connecter à la base de données');
      process.exit(1);
    }

    // Table owner_balances
    console.log('📝 Création de la table owner_balances...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS owner_balances (
        id INT PRIMARY KEY AUTO_INCREMENT,
        owner_id INT NOT NULL,
        current_balance DECIMAL(10, 2) DEFAULT 0.00,
        pending_balance DECIMAL(10, 2) DEFAULT 0.00,
        total_earned DECIMAL(10, 2) DEFAULT 0.00,
        last_transaction_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_owner_balance (owner_id),
        INDEX idx_owner (owner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Table balance_transactions
    console.log('📝 Création de la table balance_transactions...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS balance_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        owner_id INT NOT NULL,
        reservation_id INT,
        payment_id INT,
        type ENUM('earning', 'fee', 'refund', 'withdrawal') NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        description TEXT,
        status ENUM('pending', 'completed', 'failed') DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
        INDEX idx_owner (owner_id),
        INDEX idx_reservation (reservation_id),
        INDEX idx_payment (payment_id),
        INDEX idx_type (type),
        INDEX idx_status (status),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Initialiser les balances pour les propriétaires existants
    console.log('📝 Initialisation des balances pour les propriétaires existants...');
    await executeQuery(`
      INSERT INTO owner_balances (owner_id, current_balance, total_earned)
      SELECT id, 0.00, 0.00
      FROM users
      WHERE role = 'proprietaire'
      AND id NOT IN (SELECT owner_id FROM owner_balances)
    `);

    console.log('✅ Migrations pour le système de balances terminées avec succès !');
    console.log('📊 Tables créées :');
    console.log('   - owner_balances (balances des propriétaires)');
    console.log('   - balance_transactions (historique des transactions)');
    console.log('');
    console.log('🔧 Prochaines étapes :');
    console.log('   1. Implémenter le BalanceService');
    console.log('   2. Ajouter les routes de gestion des balances');
    console.log('   3. Intégrer la mise à jour automatique lors des paiements');

  } catch (error) {
    console.error('❌ Erreur lors des migrations balances:', error);
    process.exit(1);
  }
}

// Exécuter les migrations si le script est appelé directement
if (require.main === module) {
  runBalanceMigrations().then(() => {
    console.log('🎉 Migrations balances terminées !');
    process.exit(0);
  }).catch((error) => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = { runBalanceMigrations };