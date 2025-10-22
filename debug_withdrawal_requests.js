// Script de débogage pour les demandes de retrait
const { executeQuery } = require('./config/database');

async function debugWithdrawalRequests() {
  console.log('🔍 Débogage des demandes de retrait...\n');

  try {
    // Test 1: Requête simple sans paramètres
    console.log('Test 1: Requête simple');
    const test1 = await executeQuery('SELECT COUNT(*) as total FROM withdrawal_requests');
    console.log('✅ Nombre total de demandes:', test1[0].total);

    // Test 2: Requête avec un paramètre
    console.log('\nTest 2: Requête avec statut');
    const test2 = await executeQuery('SELECT COUNT(*) as total FROM withdrawal_requests WHERE status = ?', ['pending']);
    console.log('✅ Demandes en attente:', test2[0].total);

    // Test 3: Requête avec LIMIT et OFFSET comme entiers
    console.log('\nTest 3: Requête avec LIMIT/OFFSET entiers');
    const test3 = await executeQuery(`
      SELECT wr.*, u.first_name, u.last_name, u.email
      FROM withdrawal_requests wr
      LEFT JOIN users u ON wr.owner_id = u.id
      ORDER BY wr.requested_at DESC
      LIMIT ? OFFSET ?
    `, [10, 0]);
    console.log('✅ Requête avec LIMIT/OFFSET réussie, résultats:', test3.length);

    // Test 4: Requête complète comme dans l'API
    console.log('\nTest 4: Requête complète avec tous les paramètres');
    const query = `
      SELECT wr.*, u.first_name, u.last_name, u.email,
             admin.first_name as processed_by_first_name,
             admin.last_name as processed_by_last_name
      FROM withdrawal_requests wr
      LEFT JOIN users u ON wr.owner_id = u.id
      LEFT JOIN users admin ON wr.processed_by = admin.id
      WHERE 1=1
      AND wr.status = ?
      ORDER BY wr.requested_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const params = ['pending', 10, 0];
    console.log('Paramètres:', params);
    console.log('Types des paramètres:', params.map(p => typeof p));
    
    const test4 = await executeQuery(query, params);
    console.log('✅ Requête complète réussie, résultats:', test4.length);

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error('Détails:', error);
  }
}

// Exécuter le débogage si ce fichier est lancé directement
if (require.main === module) {
  debugWithdrawalRequests().then(() => {
    console.log('\n🎯 Débogage terminé');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = { debugWithdrawalRequests };