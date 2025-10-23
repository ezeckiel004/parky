-- Migration pour ajouter le support de l'authentification Facebook
-- À exécuter dans votre base de données MySQL

-- Ajouter la colonne facebook_id (en gérant le cas où google_id existe déjà)
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'google_id'
);

-- Si google_id existe, ajouter facebook_id après
SET @sql = IF(@column_exists > 0, 
    'ALTER TABLE users ADD COLUMN facebook_id VARCHAR(255) NULL UNIQUE AFTER google_id',
    'ALTER TABLE users ADD COLUMN facebook_id VARCHAR(255) NULL UNIQUE AFTER email'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ajouter profile_picture_url si elle n'existe pas déjà
SET @column_exists_picture = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'users' 
    AND (COLUMN_NAME = 'profile_picture' OR COLUMN_NAME = 'profile_picture_url')
);

SET @sql_picture = IF(@column_exists_picture = 0, 
    'ALTER TABLE users ADD COLUMN profile_picture_url TEXT NULL AFTER facebook_id',
    'SELECT "Colonne profile_picture déjà existante" as message'
);
PREPARE stmt_picture FROM @sql_picture;
EXECUTE stmt_picture;
DEALLOCATE PREPARE stmt_picture;

-- Index pour améliorer les performances (ignorer si existe déjà)
CREATE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id);

-- Afficher le résultat
SELECT 'Migration Facebook Auth terminée' as status;

-- Pour voir la structure mise à jour de la table
DESC users;