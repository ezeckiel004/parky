-- Script pour insérer des données de test pour les demandes de retrait
-- Assurez-vous d'avoir des propriétaires avec des balances avant d'exécuter ce script

-- Insérer une balance de test pour un propriétaire (remplacez l'ID par un ID existant)
INSERT IGNORE INTO owner_balances (owner_id, current_balance, total_earned) 
SELECT id, 150.00, 300.00 
FROM users 
WHERE role = 'proprietaire' 
LIMIT 1;

-- Insérer quelques demandes de retrait de test
INSERT IGNORE INTO withdrawal_requests (
    owner_id, 
    amount, 
    payment_method, 
    bank_details, 
    status,
    requested_at
) 
SELECT 
    u.id,
    50.00,
    'bank_transfer',
    JSON_OBJECT(
        'accountHolder', CONCAT(u.first_name, ' ', u.last_name),
        'iban', 'FR1420041010050500013M02606',
        'bic', 'PSSTFRPPXXX',
        'bankName', 'Banque Populaire'
    ),
    'pending',
    NOW()
FROM users u 
WHERE u.role = 'proprietaire' 
LIMIT 1;

-- Insérer une demande approuvée
INSERT IGNORE INTO withdrawal_requests (
    owner_id, 
    amount, 
    payment_method, 
    bank_details, 
    status,
    requested_at,
    processed_at,
    admin_notes
) 
SELECT 
    u.id,
    25.00,
    'paypal',
    JSON_OBJECT(
        'paypalEmail', u.email
    ),
    'approved',
    DATE_SUB(NOW(), INTERVAL 1 DAY),
    NOW(),
    'Demande approuvée automatiquement'
FROM users u 
WHERE u.role = 'proprietaire' 
LIMIT 1;

-- Afficher le résumé
SELECT 
    'withdrawal_requests' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
    COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
FROM withdrawal_requests;