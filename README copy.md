# Parky Backend API

Backend API pour l'application de parking Parky, développé avec Node.js, Express et MySQL.

## 🚀 Fonctionnalités

- **Authentification JWT** avec gestion des rôles (client, propriétaire, admin)
- **Gestion des parkings** avec géolocalisation et disponibilité en temps réel
- **Système de réservation** avec validation des conflits
- **Paiements sécurisés** avec support de multiples méthodes
- **Avis et notations** des parkings
- **Notifications** en temps réel
- **API RESTful** complète avec documentation
 
## 📋 Prérequis

- Node.js (version 16 ou supérieure)
- MySQL (version 8.0 ou supérieure)
- npm ou yarn

## 🛠️ Installation

1. **Cloner le projet**
```bash
cd backend
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer l'environnement**
```bash
cp env.example .env
```

Éditer le fichier `.env` avec vos configurations :
```env
# Configuration du serveur
PORT=3000
NODE_ENV=development

# Configuration de la base de données MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=parking_app

# Configuration JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# Configuration email (pour les notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password

# Configuration de l'API
API_BASE_URL=http://localhost:3000/api
CORS_ORIGIN=http://localhost:3000

# Configuration de sécurité
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

4. **Créer la base de données**
```sql
CREATE DATABASE parking_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

5. **Exécuter les migrations**
```bash
npm run migrate
```

6. **Ajouter des données de test (optionnel)**
```bash
npm run seed
```

## 🚀 Démarrage

### Mode développement
```bash
npm run dev
```

### Mode production
```bash
npm start
```

L'API sera disponible sur `http://localhost:3000`

## 📚 Documentation de l'API

### Endpoints principaux

#### Authentification
- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion
- `POST /api/auth/forgot-password` - Mot de passe oublié
- `POST /api/auth/reset-password` - Réinitialisation du mot de passe
- `GET /api/auth/verify` - Vérification du token

#### Utilisateurs
- `GET /api/users/profile` - Profil utilisateur
- `PUT /api/users/profile` - Mise à jour du profil
- `PUT /api/users/change-password` - Changement de mot de passe
- `GET /api/users/` - Liste des utilisateurs (admin)
- `GET /api/users/:id` - Détails d'un utilisateur (admin)

#### Parkings
- `GET /api/parking/` - Liste des parkings
- `GET /api/parking/:id` - Détails d'un parking
- `POST /api/parking/` - Créer un parking (propriétaire)
- `PUT /api/parking/:id` - Modifier un parking (propriétaire)
- `DELETE /api/parking/:id` - Supprimer un parking (propriétaire)
- `GET /api/parking/owner/my-parkings` - Mes parkings (propriétaire)

#### Réservations
- `POST /api/reservations/` - Créer une réservation
- `GET /api/reservations/my-reservations` - Mes réservations
- `GET /api/reservations/:id` - Détails d'une réservation
- `PATCH /api/reservations/:id/cancel` - Annuler une réservation
- `GET /api/reservations/parking/:parkingId` - Réservations d'un parking (propriétaire)
- `PATCH /api/reservations/:id/confirm` - Confirmer une réservation (propriétaire)
- `PATCH /api/reservations/:id/complete` - Terminer une réservation (propriétaire)

#### Paiements
- `POST /api/payments/` - Créer un paiement
- `GET /api/payments/my-payments` - Mes paiements
- `GET /api/payments/:id` - Détails d'un paiement
- `GET /api/payments/parking/:parkingId` - Paiements d'un parking (propriétaire)
- `GET /api/payments/parking/:parkingId/stats` - Statistiques de paiement (propriétaire)
- `POST /api/payments/:id/refund` - Rembourser un paiement (admin/propriétaire)

### Authentification

L'API utilise JWT (JSON Web Tokens) pour l'authentification. Incluez le token dans le header Authorization :

```
Authorization: Bearer <your_jwt_token>
```

### Codes de statut HTTP

- `200` - Succès
- `201` - Créé avec succès
- `400` - Requête invalide
- `401` - Non authentifié
- `403` - Accès refusé
- `404` - Ressource non trouvée
- `409` - Conflit
- `422` - Données invalides
- `500` - Erreur serveur

## 🗄️ Structure de la base de données

### Tables principales

- **users** - Utilisateurs (clients, propriétaires, admins)
- **parkings** - Informations des parkings
- **parking_spaces** - Places de parking individuelles
- **reservations** - Réservations des utilisateurs
- **payments** - Paiements des réservations
- **refunds** - Remboursements
- **reviews** - Avis et notations
- **notifications** - Notifications utilisateurs
- **parking_images** - Images des parkings
- **parking_operating_hours** - Horaires d'ouverture

## 🔒 Sécurité

- **JWT** pour l'authentification
- **bcrypt** pour le hachage des mots de passe
- **Rate limiting** pour prévenir les abus
- **Validation** des données avec express-validator
- **CORS** configuré
- **Helmet** pour les en-têtes de sécurité

## 🧪 Tests

```bash
npm test
```

## 📦 Scripts disponibles

```bash
npm start          # Démarrer en mode production
npm run dev        # Démarrer en mode développement
npm test           # Exécuter les tests
npm run migrate    # Exécuter les migrations
npm run seed       # Ajouter des données de test
```

## 🔧 Configuration

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|---------|
| `PORT` | Port du serveur | 3000 |
| `NODE_ENV` | Environnement | development |
| `DB_HOST` | Hôte MySQL | localhost |
| `DB_PORT` | Port MySQL | 3306 |
| `DB_USER` | Utilisateur MySQL | root |
| `DB_PASSWORD` | Mot de passe MySQL | - |
| `DB_NAME` | Nom de la base de données | parking_app |
| `JWT_SECRET` | Clé secrète JWT | - |
| `JWT_EXPIRES_IN` | Expiration JWT | 7d |

## 📱 Intégration avec l'app Flutter

L'API est conçue pour s'intégrer parfaitement avec l'application Flutter Parky. Les endpoints sont optimisés pour les besoins mobiles avec :

- Réponses JSON optimisées
- Pagination pour les listes
- Gestion des erreurs mobile-friendly
- Support des notifications push

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🆘 Support

Pour toute question ou problème, veuillez ouvrir une issue sur GitHub.

---

**Parky Backend API** - Une solution complète pour la gestion de parkings 🚗 