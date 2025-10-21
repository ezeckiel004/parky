-- Table pour les demandes de retrait
CREATE TABLE withdrawal_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'approved', 'rejected', 'processed') DEFAULT 'pending',
    payment_method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer',
    bank_details JSON NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    processed_by INT NULL,
    admin_notes TEXT NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Contraintes de clés étrangères
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Index pour optimiser les performances
    INDEX idx_owner_id (owner_id),
    INDEX idx_status (status),
    INDEX idx_requested_at (requested_at)
);