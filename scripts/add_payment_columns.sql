-- Script SQL pour ajouter les colonnes manquantes à la table payments
-- Exécutez ces commandes dans votre base de données MySQL

-- Ajouter les colonnes manquantes pour les paiements Stripe
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(255) NULL COMMENT 'ID du charge Stripe',
ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(4) NULL COMMENT 'Derniers 4 chiffres de la carte',
ADD COLUMN IF NOT EXISTS card_brand VARCHAR(50) NULL COMMENT 'Marque de la carte (visa, mastercard, etc)',
ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255) NULL COMMENT 'ID de transaction générique',
ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL COMMENT 'Date de completion du paiement',
ADD COLUMN IF NOT EXISTS refunded_at DATETIME NULL COMMENT 'Date de remboursement du paiement';

-- Optionnel : Ajouter des index pour améliorer les performances
ALTER TABLE payments 
ADD INDEX IF NOT EXISTS idx_stripe_charge_id (stripe_charge_id),
ADD INDEX IF NOT EXISTS idx_transaction_id (transaction_id),
ADD INDEX IF NOT EXISTS idx_card_last4 (card_last4);

-- Vérifier que les colonnes ont été ajoutées
DESCRIBE payments;