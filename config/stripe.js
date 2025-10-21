const Stripe = require('stripe');

// Vérifier que la clé Stripe est présente
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️ STRIPE_SECRET_KEY non définie. Les fonctionnalités de paiement seront désactivées.');
  module.exports = null;
} else {
  // Initialiser Stripe avec la clé secrète
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  });
  
  module.exports = stripe;
}