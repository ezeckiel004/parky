# Workflow Complet - Paiement Stripe Parky

## 1. Prérequis - Migration des Tables

Avant de commencer, vous devez migrer les tables de balance si elles n'existent pas :

```bash
# Exécuter le script de migration
npm run migrate:stripe
npm run migrate:balances
```

Les tables créées :
- `owner_balances` : Balance actuelle de chaque propriétaire
- `balance_transactions` : Historique des transactions (gains, commissions, retraits) // Ceci peut etre ignoré au besoin

## 2. Configuration Stripe

Variables d'environnement requises dans `.env` :
```env
STRIPE_SECRET_KEY=sk_test_votre_cle_stripe_de_test_ici
STRIPE_WEBHOOK_SECRET=whsec_votre_secret_webhook_stripe_ici
FRONTEND_URL=http://localhost:3000
```

La clé stripe s'obtient classiquement via stripe STRIPE_SECRET_KEY mais pour la clé STRIPE_WEBHOOK_SECRET elle s'obtient soit par l'interface stripe au niveau des webhooks mais là il faut utiliser un lien https. Le http n'est pass permis. Une maniere simple d'utiliser le https est d'utiliser ngrok pour générer un lien https sur le port 3000. Attention pour ce lien dans le champ de destionation au niveau de stripe on complete : /api/webhooks/stripe.

Ex : https://chiropodial-taylor-stational.ngrok-free.dev/api/webhooks/stripe

## 3. Workflow Complet de Paiement

### Étape 1: Authentification

**Endpoint** : `POST /api/auth/login`

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"email": "client@Parky.com", "password": "password123"}' \
  http://localhost:3000/api/auth/login
```

**Réponse** :
```json
{
  "message": "Connexion réussie",
  "user": {
    "id": 4,
    "email": "client@Parky.com",
    "role": "client"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Étape 2: Création d'une Réservation

**Endpoint** : `POST /api/reservations`

```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "spaceId": 1,
    "startTime": "2025-10-02T13:00:00Z",
    "endTime": "2025-10-02T16:00:00Z",
    "vehiclePlate": "ABC-123"
  }' \
  http://localhost:3000/api/reservations
```

**Réponse** :
```json
{
  "message": "Réservation créée avec succès",
  "reservation": {
    "id": 8,
    "space_id": 1,
    "user_id": 4,
    "start_time": "2025-10-02T13:00:00.000Z",
    "end_time": "2025-10-02T16:00:00.000Z",
    "total_amount": "10.50",
    "status": "pending",
    "vehicle_plate": "ABC-123"
  }
}
```

### Étape 3: Création de la Session de Paiement Stripe

**Endpoint** : `POST /api/payments/create-checkout-session`

```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservationId": 8,
    "successUrl": "FRONTEND_URL://payment/success?session_id={CHECKOUT_SESSION_ID}",
    "cancelUrl": "FRONTEND_URL://payment/cancel?session_id={CHECKOUT_SESSION_ID}"
  }' \
  http://localhost:3000/api/payments/create-checkout-session
```

**Réponse** :
```json
{
  "message": "Session de paiement créée avec succès",
  "sessionId": "cs_test_a1MEFnfZn0vi6JjHViMC90lnx7EARIYgwuGVb2P3uf5dG5pibLMsYO2bsa",
  "url": "https://checkout.stripe.com/c/pay/cs_test_a1MEFnfZn0vi6JjHViMC90lnx7EARIYgwuGVb2P3uf5dG5pibLMsYO2bsa#fidkdWxOYHwnPyd1blpxYHZxWjA0SjVcMkNqMXI8YTRjPTM9TX1MZGgxUUFuNFRmbTRoVU5uPDJiVGhnTWZ9UEtydkxxUzFsQGE8dkdAVGlqVG1pV2ZdPFBKaWp9Y0tzdGlhXSFoT0wwNG1sXDJIdGF3YjdDMycs",
  "reservationId": 8,
  "amount": 10.5
}
```

### Étape 4: Redirection vers Stripe

L'utilisateur est redirigé vers l'URL Stripe pour effectuer le paiement (url de la réponse précédente). Une fois payé il est redirigé vers le lien frontend correspondant en front ou back. Mais dans une appli mobile on peut revenir sur une page et appelé la route ci dessous afin de savoir si le paiement est passé ou pas.

### Étape 5: Vérification du Statut de Paiement

**Endpoint** : `GET /api/payments/session-status/{sessionId}`

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/payments/session-status/cs_test_a1MEFnfZn0vi6JjHViMC90lnx7EARIYgwuGVb2P3uf5dG5pibLMsYO2bsa
```

**Réponse (paiement réussi)** :
```json
{
  "message": "Statut de session récupéré avec succès",
  "session": {
    "id": "cs_test_a1MEFnfZn0vi6JjHViMC90lnx7EARIYgwuGVb2P3uf5dG5pibLMsYO2bsa",
    "payment_status": "paid",
    "status": "complete"
  },
  "reservation": {
    "id": 8,
    "status": "paid",
    "total_amount": "10.50"
  },
  "payment": {
    "id": 8,
    "status": "completed",
    "amount": "10.50"
  }
}
```

## 4. Traitement Automatique par Webhook

Le webhook Stripe (`POST /api/webhooks/stripe`) traite automatiquement :

1. **Confirmation du paiement** - Événement `checkout.session.completed`
2. **Mise à jour de la réservation** - Status → `paid`
3. **Calcul des revenus** - 85% propriétaire, 15% commission Parky
4. **Mise à jour de la balance propriétaire**

### Calcul des Revenus (Commission 15%)

Pour un paiement de 10.50€ :
- **Commission Parky** : 10.50€ × 15% = 1.57€
- **Revenus propriétaire** : 10.50€ - 1.57€ = 8.93€

## 5. Gestion des Balances (Admin)

### Connexion Admin

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"email": "admin@Parky.com", "password": "password123"}' \
  http://localhost:3000/api/auth/login
```

### Consulter le Résumé des Balances

```bash
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  http://localhost:3000/api/balance/summary
```

**Réponse** :
```json
{
  "message": "Résumé des balances récupéré avec succès",
  "summary": [
    {
      "id": 2,
      "first_name": "Jean",
      "last_name": "Dupont",
      "email": "proprio1@Parky.com",
      "current_balance": "8.93",
      "total_earned": "8.93",
      "total_parkings": 6
    }
  ],
  "globalStats": {
    "total_owners": 2,
    "total_balances": "8.93",
    "total_earned_all_time": "8.93"
  }
}
```

### Marquer un Propriétaire comme Payé

```bash
curl -X POST -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ownerIds": [2]}' \
  http://localhost:3000/api/balance/mark-paid
```

**Réponse** :
```json
{
  "message": "Paiements marqués comme effectués pour 1 propriétaire(s)",
  "processedOwners": [
    {
      "id": 2,
      "first_name": "Jean",
      "last_name": "Dupont",
      "email": "proprio1@Parky.com",
      "current_balance": "0.00"
    }
  ],
  "totalPaidOut": 8.93
}
```

### Marquer TOUS les Propriétaires comme Payés

```bash
curl -X POST -H "Authorization: Bearer ADMIN_TOKEN" \
  http://localhost:3000/api/balance/mark-all-paid
```

## 6. Consultation des Transactions

### Historique d'un Propriétaire

```bash
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "http://localhost:3000/api/balance/owner/2/transactions?limit=5"
```

**Réponse** :
```json
{
  "message": "Transactions propriétaire récupérées avec succès",
  "transactions": [
    {
      "id": 3,
      "type": "withdrawal",
      "amount": "8.93",
      "description": "Paiement effectué par admin",
      "created_at": "2025-09-27T13:35:29.000Z"
    },
    {
      "id": 1,
      "type": "earning",
      "amount": "8.93",
      "description": "Revenus réservation #8 - Parking Centre-ville",
      "created_at": "2025-09-27T13:28:19.000Z"
    },
    {
      "id": 2,
      "type": "fee",
      "amount": "-1.57",
      "description": "Commission Parky (15%) - Réservation #8",
      "created_at": "2025-09-27T13:28:19.000Z"
    }
  ]
}
```

## 7. Gestion d'Erreurs

### Paiement Échoué

Si le paiement échoue, le webhook `payment_intent.payment_failed` :
- Marque la réservation comme `cancelled`
- Crée un enregistrement de paiement échoué

### Gestion des Litiges

Le webhook `charge.dispute.created` log les litiges pour traitement manuel.

## 8. URLs de Test

- **API Base** : `http://localhost:3000/api`
- **Santé** : `http://localhost:3000/api/health`
- **Webhook Stripe** : `http://localhost:3000/api/webhooks/stripe`

## 9. Flux Mobile

Pour les applications mobiles, utilisez des URL schemes personnalisés :
- **Succès** : `myapp://payment/success?session_id={CHECKOUT_SESSION_ID}`
- **Annulation** : `myapp://payment/cancel?session_id={CHECKOUT_SESSION_ID}`

## 10. Résumé du Workflow

1. **Login** → Obtenir token JWT
2. **Créer réservation** → Obtenir ID réservation
3. **Créer session Stripe** → Obtenir URL de paiement
4. **Rediriger vers Stripe** → Paiement utilisateur
5. **Webhook automatique** → Mise à jour balance propriétaire
6. **Vérifier statut** → Confirmer paiement réussi
7. **Admin marque payé** → Retrait des gains propriétaire

Le système gère automatiquement la répartition des revenus avec 15% de commission pour Parky.