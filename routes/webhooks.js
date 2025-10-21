const express = require('express');
const stripe = require('../config/stripe');
const { executeQuery } = require('../config/database');
const StripeService = require('../services/stripeService');

const router = express.Router();

// Middleware pour traiter les webhooks Stripe
// IMPORTANT : Ce endpoint doit être configuré AVANT le middleware express.json()
router.post('/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Vérifier la signature du webhook
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Erreur webhook signature:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Traiter les différents types d'événements
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'charge.dispute.created':
        await handleChargeDispute(event.data.object);
        break;

      default:
        console.log(`Événement Stripe non géré: ${event.type}`);
    }

    res.json({received: true});
  } catch (error) {
    console.error('Erreur traitement webhook Stripe:', error);
    res.status(500).json({error: 'Erreur serveur'});
  }
});

// Gestionnaire pour paiement réussi
async function handlePaymentSucceeded(paymentIntent) {
  try {
    console.log('Webhook: Paiement réussi -', paymentIntent.id);

    if (!paymentIntent.metadata.reservation_id) {
      console.log('Pas de reservation_id dans les métadonnées');
      return;
    }

    const reservationId = parseInt(paymentIntent.metadata.reservation_id);

    // Vérifier si le paiement existe déjà
    const existingPayment = await executeQuery(
      'SELECT id FROM payments WHERE stripe_payment_intent_id = ?',
      [paymentIntent.id]
    );

    if (existingPayment.length === 0) {
      // Créer le paiement si il n'existe pas déjà
      await StripeService.confirmPayment(paymentIntent.id);
      console.log('Paiement confirmé via webhook pour réservation:', reservationId);
    } else {
      console.log('Paiement déjà existant:', existingPayment[0].id);
    }
  } catch (error) {
    console.error('Erreur dans handlePaymentSucceeded:', error);
    throw error;
  }
}

// Gestionnaire pour paiement échoué
async function handlePaymentFailed(paymentIntent) {
  try {
    console.log('Webhook: Paiement échoué -', paymentIntent.id);

    if (!paymentIntent.metadata.reservation_id) {
      console.log('Pas de reservation_id dans les métadonnées');
      return;
    }

    const reservationId = parseInt(paymentIntent.metadata.reservation_id);
    const userId = parseInt(paymentIntent.metadata.user_id);

    // Marquer la réservation comme annulée
    await executeQuery(
      'UPDATE reservations SET status = "cancelled" WHERE id = ?',
      [reservationId]
    );

    // Créer un enregistrement de paiement échoué
    await executeQuery(
      `INSERT INTO payments
       (reservation_id, user_id, amount, payment_method, status,
        stripe_payment_intent_id, failed_at, created_at)
       VALUES (?, ?, ?, 'card', 'failed', ?, NOW(), NOW())`,
      [
        reservationId,
        userId,
        paymentIntent.amount / 100,
        paymentIntent.id
      ]
    );

    console.log('Paiement marqué comme échoué pour réservation:', reservationId);
  } catch (error) {
    console.error('Erreur dans handlePaymentFailed:', error);
    throw error;
  }
}

// Gestionnaire pour session Checkout complétée
async function handleCheckoutCompleted(session) {
  try {
    console.log('Webhook: Session Checkout complétée -', session.id);

    if (!session.metadata.reservation_id) {
      console.log('Pas de reservation_id dans les métadonnées de session');
      return;
    }

    const reservationId = parseInt(session.metadata.reservation_id);
    const userId = parseInt(session.metadata.user_id);

    // Vérifier si le paiement existe déjà
    const existingPayment = await executeQuery(
      'SELECT id FROM payments WHERE reservation_id = ? AND status = "completed"',
      [reservationId]
    );

    if (existingPayment.length > 0) {
      console.log('Paiement déjà existant pour réservation:', reservationId);
      return;
    }

    // Récupérer le Payment Intent depuis la session
    if (session.payment_intent) {
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent, {
        expand: ['charges.data.payment_method_details']
      });

      // Récupérer les détails de la charge pour les infos de carte
      const charges = paymentIntent.charges?.data || [];
      const charge = charges.length > 0 ? charges[0] : null;
      const cardLast4 = charge?.payment_method_details?.card?.last4 || null;
      const cardBrand = charge?.payment_method_details?.card?.brand || null;

      // Créer l'enregistrement de paiement avec les métadonnées de session
      const result = await executeQuery(
        `INSERT INTO payments
         (reservation_id, user_id, amount, payment_method, status,
          transaction_id, stripe_payment_intent_id, stripe_customer_id,
          card_last4, card_brand, created_at, completed_at)
         VALUES (?, ?, ?, 'card', 'completed', ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          reservationId,
          userId,
          session.amount_total / 100,
          paymentIntent.id,
          paymentIntent.id,
          session.customer,
          cardLast4,
          cardBrand
        ]
      );

      // Mettre à jour le statut de la réservation
      await executeQuery(
        'UPDATE reservations SET status = "paid", paid_at = NOW() WHERE id = ?',
        [reservationId]
      );

      // Mettre à jour la balance du propriétaire
      try {
        const BalanceService = require('../services/balanceService');
        await BalanceService.updateOwnerBalance(reservationId);
        console.log(`✅ Balance propriétaire mise à jour pour réservation ${reservationId}`);
      } catch (balanceError) {
        console.error(`❌ Erreur mise à jour balance pour réservation ${reservationId}:`, balanceError);
        // On ne fait pas échouer le paiement si la balance échoue
        // Mais on devrait logger/alerter pour traitement manuel
      }

      console.log('Paiement traité via session checkout pour réservation:', reservationId);
    }
  } catch (error) {
    console.error('Erreur dans handleCheckoutCompleted:', error);
    throw error;
  }
}

// Gestionnaire pour les litiges
async function handleChargeDispute(dispute) {
  try {
    console.log('Webhook: Litige créé -', dispute.id);

    // Ici vous pourriez notifier les administrateurs du litige
    // et prendre les mesures appropriées

    // Pour l'instant, on ne fait que logger
    console.log('Litige sur la charge:', dispute.charge);
    console.log('Montant du litige:', dispute.amount / 100, dispute.currency);
    console.log('Raison:', dispute.reason);
  } catch (error) {
    console.error('Erreur dans handleChargeDispute:', error);
    throw error;
  }
}

module.exports = router;