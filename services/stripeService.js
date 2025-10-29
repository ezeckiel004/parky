const stripe = require('../config/stripe');
const { executeQuery } = require('../config/database');
const BalanceService = require('./balanceService');

class StripeService {
  // Créer ou récupérer un customer Stripe
  static async getOrCreateCustomer(user) {
    try {
      // Vérifier si le customer existe déjà en base
      const existingCustomer = await executeQuery(
        'SELECT stripe_customer_id FROM payments WHERE user_id = ? AND stripe_customer_id IS NOT NULL LIMIT 1',
        [user.id]
      );

      if (existingCustomer.length > 0 && existingCustomer[0].stripe_customer_id) {
        return existingCustomer[0].stripe_customer_id;
      }

      // Créer un nouveau customer Stripe
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        phone: user.phone,
        metadata: {
          user_id: user.id.toString(),
          app: 'parky'
        }
      });

      return customer.id;
    } catch (error) {
      console.error('Erreur création customer Stripe:', error);
      throw error;
    }
  }

  // Créer un Payment Intent
  // Dans StripeService.createPaymentIntent
static async createPaymentIntent(reservationId, user, amount, currency = 'eur') {
  try {
    // Récupérer les détails de la réservation SANS price_per_hour
    const reservation = await executeQuery(
      `SELECT r.*, ps.space_number, p.name as parking_name, p.address
       FROM reservations r
       JOIN parking_spaces ps ON r.space_id = ps.id
       JOIN parkings p ON ps.parking_id = p.id
       WHERE r.id = ? AND r.user_id = ?`,
      [reservationId, user.id]
    );

    if (reservation.length === 0) {
      throw new Error('Réservation non trouvée');
    }

    const customerId = await this.getOrCreateCustomer(user);

    // Utiliser le montant passé en paramètre (du frontend)
    console.log(`Montant utilisé pour PaymentIntent: ${amount}€`);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency,
      customer: customerId,
      metadata: {
        reservation_id: reservationId.toString(),
        user_id: user.id.toString(),
        parking_name: reservation[0].parking_name,
        space_number: reservation[0].space_number,
        app: 'parky'
      },
      description: `Réservation parking ${reservation[0].parking_name} - Place ${reservation[0].space_number}`,
    });

    // Créer l'enregistrement payments
    const paymentResult = await executeQuery(
      `INSERT INTO payments 
       (reservation_id, user_id, amount, payment_method, status, 
        stripe_payment_intent_id, stripe_customer_id, 
        created_at)
       VALUES (?, ?, ?, 'card', 'pending', ?, ?, NOW())`,
      [reservationId, user.id, amount, paymentIntent.id, customerId]
    );

    console.log(`✅ Payment record créé pour PI ${paymentIntent.id}`);

    return paymentIntent;

  } catch (error) {
    console.error('Erreur création PaymentIntent:', error);
    throw error;
  }
}

  // Confirmer un paiement et mettre à jour la base de données
  // Dans StripeService.createPaymentIntent
// Dans StripeService.confirmPayment
static async confirmPayment(paymentIntentId) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    console.log(`PaymentIntent ${paymentIntentId} status: ${paymentIntent.status}`);

    if (paymentIntent.status === 'succeeded') {
      // Récupérer l'enregistrement payment existant
      const payment = await executeQuery(
        'SELECT * FROM payments WHERE stripe_payment_intent_id = ?',
        [paymentIntentId]
      );

      if (payment.length === 0) {
        throw new Error('Enregistrement payment introuvable');
      }

      const reservationId = payment[0].reservation_id;
      const userId = payment[0].user_id;

      // ✅ VÉRIFIER que charges existe avant d'accéder à .data
      let cardLast4 = null;
      let cardBrand = null;
      let stripeChargeId = null;

      if (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data.length > 0) {
        const charge = paymentIntent.charges.data[0];
        cardLast4 = charge.payment_method_details?.card?.last4 || null;
        cardBrand = charge.payment_method_details?.card?.brand || null;
        stripeChargeId = charge.id;
        console.log(`Charge trouvée: ${stripeChargeId}, Carte: ${cardBrand} ****${cardLast4}`);
      } else {
        console.log('⚠️ Aucune charge trouvée dans PaymentIntent - Utilisation des métadonnées');
        // Fallback : récupérer depuis le payment_method directement
        if (paymentIntent.payment_method) {
          try {
            const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
            if (paymentMethod.card) {
              cardLast4 = paymentMethod.card.last4;
              cardBrand = paymentMethod.card.brand;
              console.log(`PaymentMethod fallback - Carte: ${cardBrand} ****${cardLast4}`);
            }
          } catch (pmError) {
            console.log('Impossible de récupérer payment_method:', pmError.message);
          }
        }
      }

      // Mettre à jour l'enregistrement existant
      await executeQuery(
        `UPDATE payments 
         SET status = 'completed', 
             completed_at = NOW(),
             transaction_id = ?,
             card_last4 = ?,
             card_brand = ?,
             stripe_charge_id = ?
         WHERE stripe_payment_intent_id = ?`,
        [
          paymentIntent.id,
          cardLast4,
          cardBrand,
          stripeChargeId,
          paymentIntentId
        ]
      );

      // Mettre à jour la réservation ET marquer la place comme occupée
      await executeQuery(
        'UPDATE reservations SET status = "paid", paid_at = NOW() WHERE id = ?',
        [reservationId]
      );

      // IMPORTANT: Marquer la place comme occupée SEULEMENT après paiement confirmé
      const reservationData = await executeQuery(
        'SELECT space_id FROM reservations WHERE id = ?',
        [reservationId]
      );
      
      if (reservationData.length > 0) {
        await executeQuery(
          'UPDATE parking_spaces SET status = "occupied" WHERE id = ?',
          [reservationData[0].space_id]
        );
        console.log(`✅ Place ${reservationData[0].space_id} marquée comme occupée après paiement`);
      }

      // Mettre à jour la balance
      try {
        await BalanceService.updateOwnerBalance(reservationId);
        console.log(`✅ Balance propriétaire mise à jour pour ${reservationId}`);
      } catch (balanceError) {
        console.error('❌ Erreur balance:', balanceError);
        // Ne pas faire échouer le paiement
      }

      console.log(`✅ Paiement confirmé pour réservation ${reservationId}`);
      return payment[0].id;

    } else {
      console.log(`❌ PaymentIntent pas succeeded: ${paymentIntent.status}`);
      throw new Error(`PaymentIntent en statut ${paymentIntent.status}`);
    }

  } catch (error) {
    console.error('Erreur confirmation paiement:', error);
    console.error('PaymentIntent ID:', paymentIntentId);
    throw error;
  }
}

  // Créer un remboursement
  static async createRefund(paymentId, amount = null, reason = 'requested_by_customer') {
    try {
      // Récupérer le paiement
      const payment = await executeQuery(
        'SELECT * FROM payments WHERE id = ? AND status = "completed" AND stripe_payment_intent_id IS NOT NULL',
        [paymentId]
      );

      if (payment.length === 0) {
        throw new Error('Paiement non trouvé ou non remboursable');
      }

      const refundAmount = amount ? Math.round(amount * 100) : Math.round(payment[0].amount * 100);

      // Créer le remboursement Stripe
      const refund = await stripe.refunds.create({
        payment_intent: payment[0].stripe_payment_intent_id,
        amount: refundAmount,
        reason: reason,
        metadata: {
          payment_id: paymentId.toString(),
          app: 'parky'
        }
      });

      // Mettre à jour le statut du paiement
      await executeQuery(
        'UPDATE payments SET status = "refunded", refunded_at = NOW() WHERE id = ?',
        [paymentId]
      );

      // Créer l'enregistrement de remboursement si la table existe
      try {
        await executeQuery(
          `INSERT INTO refunds (payment_id, amount, reason, status, created_at, completed_at)
           VALUES (?, ?, ?, 'completed', NOW(), NOW())`,
          [paymentId, refundAmount / 100, reason]
        );
      } catch (refundError) {
        // Si la table refunds n'existe pas, on continue sans erreur
        console.log('Table refunds non trouvée, remboursement enregistré uniquement dans payments');
      }

      return refund;
    } catch (error) {
      console.error('Erreur création remboursement:', error);
      throw error;
    }
  }

  // Créer une session Checkout
  static async createCheckoutSession(reservationId, user, successUrl, cancelUrl) {
    try {
      const reservation = await executeQuery(
        `SELECT r.*, ps.space_number, p.name as parking_name, p.address
         FROM reservations r
         JOIN parking_spaces ps ON r.space_id = ps.id
         JOIN parkings p ON ps.parking_id = p.id
         WHERE r.id = ? AND r.user_id = ?`,
        [reservationId, user.id]
      );

      if (reservation.length === 0) {
        throw new Error('Réservation non trouvée');
      }

      const customerId = await this.getOrCreateCustomer(user);

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Réservation parking ${reservation[0].parking_name}`,
              description: `Place ${reservation[0].space_number} - ${reservation[0].address}`,
            },
            unit_amount: Math.round(reservation[0].total_amount * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          reservation_id: reservationId.toString(),
          user_id: user.id.toString(),
          app: 'parky'
        }
      });

      return session;
    } catch (error) {
      console.error('Erreur création session Checkout:', error);
      throw error;
    }
  }
}

module.exports = StripeService;
