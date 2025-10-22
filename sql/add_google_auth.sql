-- Migration pour ajouter le support de l'authentification Google
-- À exécuter dans votre base de données MySQL

-- Ajouter les colonnes pour Google Auth
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) NULL UNIQUE AFTER email;
ALTER TABLE users ADD COLUMN profile_picture TEXT NULL AFTER google_id;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE AFTER profile_picture;

-- Index pour améliorer les performances
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_email_verified ON users(email_verified);

-- Mise à jour des utilisateurs existants (email vérifié par défaut)
UPDATE users SET email_verified = TRUE WHERE email_verified IS NULL;

-- Afficher le résultat
SELECT 'Migration Google Auth terminée' as status;