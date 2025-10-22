-- Script pour créer la table withdrawal_requests
CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    owner_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method ENUM('bank_transfer', 'paypal') NOT NULL,
    bank_details JSON,
    status ENUM('pending', 'approved', 'rejected', 'processed') DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    processed_by INT NULL,
    admin_notes TEXT NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_owner_status (owner_id, status),
    INDEX idx_status (status), 
    INDEX idx_requested_at (requested_at)
);

-- Ajout des contraintes de clé étrangère si elles n'existent pas
ALTER TABLE withdrawal_requests 
ADD CONSTRAINT fk_withdrawal_owner 
FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;