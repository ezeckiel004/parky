-- Migration pour ajouter le support de l'authentification Facebook
-- À exécuter dans votre base de données MySQL

-- Ajouter les colonnes pour Facebook Auth
ALTER TABLE users ADD COLUMN facebook_id VARCHAR(255) NULL UNIQUE AFTER google_id;

-- Si la colonne profile_picture n'existe pas encore, l'ajouter
-- (peut-être déjà ajoutée avec Google Auth)
ALTER TABLE users ADD COLUMN profile_picture_url TEXT NULL AFTER facebook_id;

-- Index pour améliorer les performances
CREATE INDEX idx_users_facebook_id ON users(facebook_id);

-- Afficher le résultat
SELECT 'Migration Facebook Auth terminée' as status;

-- Pour voir la structure mise à jour de la table
DESC users;