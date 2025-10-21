// Test script pour les demandes de retrait
// Ce script peut être exécuté avec Node.js pour tester les endpoints

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';
let authToken = '';

// Fonction d'authentification
async function login(email, password) {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email,
      password
    });
    
    authToken = response.data.token;
    console.log('✅ Connexion réussie');
    return response.data;
  } catch (error) {
    console.error('❌ Erreur de connexion:', error.response?.data || error.message);
    throw error;
  }
}

// Fonction pour créer une demande de retrait
async function createWithdrawalRequest(amount, paymentMethod, bankDetails) {
  try {
    const response = await axios.post(`${API_BASE_URL}/balance/withdrawal-request`, {
      amount,
      paymentMethod,
      bankDetails
    }, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Demande de retrait créée:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Erreur création demande:', error.response?.data || error.message);
    throw error;
  }
}

// Fonction pour récupérer les demandes de retrait (propriétaire)
async function getMyWithdrawalRequests() {
  try {
    const response = await axios.get(`${API_BASE_URL}/balance/my-withdrawal-requests`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    console.log('✅ Mes demandes de retrait:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Erreur récupération demandes:', error.response?.data || error.message);
    throw error;
  }
}

// Fonction pour récupérer toutes les demandes (admin)
async function getAllWithdrawalRequests() {
  try {
    const response = await axios.get(`${API_BASE_URL}/balance/withdrawal-requests`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    console.log('✅ Toutes les demandes de retrait:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Erreur récupération toutes demandes:', error.response?.data || error.message);
    throw error;
  }
}

// Fonction pour approuver/rejeter une demande (admin)
async function updateWithdrawalRequest(requestId, status, adminNotes = null, rejectionReason = null) {
  try {
    const response = await axios.patch(`${API_BASE_URL}/balance/withdrawal-requests/${requestId}`, {
      status,
      adminNotes,
      rejectionReason
    }, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Demande mise à jour:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Erreur mise à jour demande:', error.response?.data || error.message);
    throw error;
  }
}

// Fonction pour récupérer la balance
async function getBalance() {
  try {
    const response = await axios.get(`${API_BASE_URL}/balance/my-balance`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    console.log('✅ Balance actuelle:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Erreur récupération balance:', error.response?.data || error.message);
    throw error;
  }
}

// Script de test principal
async function runTests() {
  try {
    console.log('🚀 Début des tests des demandes de retrait\n');
    
    // 1. Connexion en tant que propriétaire
    console.log('1. Connexion en tant que propriétaire...');
    await login('proprietaire@test.com', 'password123');
    
    // 2. Vérification de la balance
    console.log('\n2. Vérification de la balance...');
    const balanceBefore = await getBalance();
    
    // 3. Création d'une demande de retrait
    console.log('\n3. Création d\'une demande de retrait...');
    const withdrawalRequest = await createWithdrawalRequest(50.00, 'bank_transfer', {
      accountHolder: 'John Doe',
      iban: 'FR1420041010050500013M02606',
      bic: 'PSSTFRPPXXX',
      bankName: 'Banque Populaire'
    });
    
    // 4. Récupération des demandes du propriétaire
    console.log('\n4. Récupération des demandes du propriétaire...');
    await getMyWithdrawalRequests();
    
    // 5. Connexion en tant qu'admin pour traiter la demande
    console.log('\n5. Connexion en tant qu\'admin...');
    await login('admin@test.com', 'admin123');
    
    // 6. Récupération de toutes les demandes (admin)
    console.log('\n6. Récupération de toutes les demandes (admin)...');
    const allRequests = await getAllWithdrawalRequests();
    
    // 7. Approbation de la demande
    if (allRequests.withdrawalRequests && allRequests.withdrawalRequests.length > 0) {
      const requestId = allRequests.withdrawalRequests[0].id;
      console.log(`\n7. Approbation de la demande ${requestId}...`);
      await updateWithdrawalRequest(requestId, 'approved', 'Demande approuvée automatiquement par le test');
    }
    
    // 8. Reconnexion en tant que propriétaire pour vérifier la balance
    console.log('\n8. Vérification de la balance après approbation...');
    await login('proprietaire@test.com', 'password123');
    const balanceAfter = await getBalance();
    
    console.log('\n✅ Tests terminés avec succès!');
    console.log(`Balance avant: ${balanceBefore.balance?.current_balance || 0}€`);
    console.log(`Balance après: ${balanceAfter.balance?.current_balance || 0}€`);
    
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error.message);
  }
}

// Exécuter les tests si ce fichier est lancé directement
if (require.main === module) {
  runTests();
}

module.exports = {
  login,
  createWithdrawalRequest,
  getMyWithdrawalRequests,
  getAllWithdrawalRequests,
  updateWithdrawalRequest,
  getBalance
};