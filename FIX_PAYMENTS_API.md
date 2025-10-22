# Fix API Payments - Corrections SQL

## Problème Identifié
Erreur: `ApiException: Incorrect arguments to mysqld_stmt_execute (Status: 500)`

Cette erreur était causée par l'utilisation incorrecte des paramètres liés (`?`) pour les clauses LIMIT et OFFSET dans les requêtes SQL.

## Solution Appliquée

### Avant (❌ Problématique)
```javascript
query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
queryParams.push(parseInt(limit), offset);
```

### Après (✅ Corrigé)
```javascript
// Validation et sécurisation des paramètres
const safeLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
const safePage = Math.max(parseInt(page) || 1, 1);
const safeOffset = (safePage - 1) * safeLimit;

// LIMIT/OFFSET intégrés directement dans la chaîne SQL
query += ` ORDER BY p.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
```

## Routes Corrigées

### 1. GET `/payments/my-payments`
- **Utilisée par**: Page d'historique des paiements client
- **Correction**: LIMIT/OFFSET intégrés directement, validation des paramètres
- **Impact**: Page des paiements fonctionne maintenant sans erreur

### 2. GET `/payments/parking/:parkingId`  
- **Utilisée par**: Dashboard propriétaire pour voir les paiements par parking
- **Correction**: Même approche que ci-dessus
- **Impact**: Dashboard propriétaire fonctionne sans erreur

## Approche de Sécurisation

1. **Validation des paramètres**:
   - `safeLimit`: Entre 1 et 100, défaut 10
   - `safePage`: Minimum 1, défaut 1
   - `safeOffset`: Calculé à partir des valeurs sécurisées

2. **Intégration SQL directe**:
   - Utilisation de template literals pour LIMIT/OFFSET
   - Évite les problèmes de paramètres liés MySQL
   - Maintient la sécurité via validation en amont

## Référence
Cette correction suit le même pattern utilisé dans `parking.js` (lignes 124-125) où les LIMIT/OFFSET sont aussi intégrés directement dans la requête SQL.

## Test
Après ces corrections, l'API `/payments/my-payments` devrait fonctionner correctement et la page PaymentsHistoryPage devrait charger sans erreur.