const { executeQuery, testConnection } = require('../config/database');

// Script de migration pour créer les tables de la base de données
async function runMigrations() {
  try {
    console.log('🚀 Début des migrations...');

    // Test de connexion
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Impossible de se connecter à la base de données');
      process.exit(1);
    }

    // Table users
    console.log('📝 Création de la table users...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        role ENUM('client', 'proprietaire', 'admin') DEFAULT 'client',
        status ENUM('active', 'inactive', 'deleted') DEFAULT 'active',
        profile_image VARCHAR(255),
        reset_token VARCHAR(255),
        reset_token_expiry DATETIME,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Table parkings
    console.log('📝 Création de la table parkings...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS parkings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        total_spaces INT NOT NULL,
        hourly_rate DECIMAL(10, 2) NOT NULL,
        description TEXT,
        amenities JSON,
        owner_id INT NOT NULL,
        status ENUM('active', 'inactive', 'deleted') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_owner (owner_id),
        INDEX idx_status (status),
        INDEX idx_location (latitude, longitude),
        INDEX idx_price (hourly_rate)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Table parking_spaces
    console.log('📝 Création de la table parking_spaces...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS parking_spaces (
        id INT PRIMARY KEY AUTO_INCREMENT,
        parking_id INT NOT NULL,
        space_number VARCHAR(50) NOT NULL,
        status ENUM('available', 'occupied', 'maintenance', 'reserved') DEFAULT 'available',
        vehicle_type ENUM('car', 'motorcycle', 'truck', 'bus', 'any') DEFAULT 'any',
        hourly_rate DECIMAL(10, 2),
        features JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (parking_id) REFERENCES parkings(id) ON DELETE CASCADE,
        UNIQUE KEY unique_parking_space (parking_id, space_number),
        INDEX idx_parking (parking_id),
        INDEX idx_status (status),
        INDEX idx_vehicle_type (vehicle_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Table reservations
    console.log('📝 Création de la table reservations...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS reservations (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        space_id INT NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        vehicle_plate VARCHAR(20),
        total_amount DECIMAL(10, 2) NOT NULL,
        status ENUM('pending', 'active', 'completed', 'cancelled', 'paid') DEFAULT 'pending',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        confirmed_at DATETIME NULL,
        completed_at DATETIME NULL,
        cancelled_at DATETIME NULL,
        paid_at DATETIME NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (space_id) REFERENCES parking_spaces(id) ON DELETE CASCADE,
        INDEX idx_user (user_id),
        INDEX idx_space (space_id),
        INDEX idx_status (status),
        INDEX idx_dates (start_time, end_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Table payments
    console.log('📝 Création de la table payments...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        reservation_id INT NOT NULL,
        user_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method ENUM('card', 'cash', 'mobile_payment') NOT NULL,
        status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
        transaction_id VARCHAR(255),
        card_last4 VARCHAR(4),
        card_brand VARCHAR(20),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        failed_at DATETIME NULL,
        refunded_at DATETIME NULL,
        FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_reservation_payment (reservation_id),
        INDEX idx_user (user_id),
        INDEX idx_status (status),
        INDEX idx_transaction (transaction_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Table refunds
    console.log('📝 Création de la table refunds...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS refunds (
        id INT PRIMARY KEY AUTO_INCREMENT,
        payment_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        reason TEXT,
        processed_by INT NOT NULL,
        status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
        FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_payment (payment_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Table reviews
    console.log('📝 Création de la table reviews...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        parking_id INT NOT NULL,
        reservation_id INT,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (parking_id) REFERENCES parkings(id) ON DELETE CASCADE,
        FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
        UNIQUE KEY unique_user_parking_review (user_id, parking_id),
        INDEX idx_parking (parking_id),
        INDEX idx_rating (rating),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Table notifications
    console.log('📝 Création de la table notifications...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        type ENUM('reservation', 'payment', 'system', 'promotion') NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSON,
        is_read BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user (user_id),
        INDEX idx_type (type),
        INDEX idx_read (is_read),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Table parking_images
    console.log('📝 Création de la table parking_images...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS parking_images (
        id INT PRIMARY KEY AUTO_INCREMENT,
        parking_id INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        image_type ENUM('main', 'gallery', 'map') DEFAULT 'gallery',
        alt_text VARCHAR(255),
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parking_id) REFERENCES parkings(id) ON DELETE CASCADE,
        INDEX idx_parking (parking_id),
        INDEX idx_type (image_type),
        INDEX idx_order (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Table parking_operating_hours
    console.log('📝 Création de la table parking_operating_hours...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS parking_operating_hours (
        id INT PRIMARY KEY AUTO_INCREMENT,
        parking_id INT NOT NULL,
        day_of_week ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') NOT NULL,
        open_time TIME,
        close_time TIME,
        is_24h BOOLEAN DEFAULT FALSE,
        is_closed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (parking_id) REFERENCES parkings(id) ON DELETE CASCADE,
        UNIQUE KEY unique_parking_day (parking_id, day_of_week),
        INDEX idx_parking (parking_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Toutes les migrations ont été exécutées avec succès !');
    console.log('📊 Tables créées :');
    console.log('   - users');
    console.log('   - parkings');
    console.log('   - parking_spaces');
    console.log('   - reservations');
    console.log('   - payments');
    console.log('   - refunds');
    console.log('   - reviews');
    console.log('   - notifications');
    console.log('   - parking_images');
    console.log('   - parking_operating_hours');

  } catch (error) {
    console.error('❌ Erreur lors des migrations:', error);
    process.exit(1);
  }
}

// Exécuter les migrations si le script est appelé directement
if (require.main === module) {
  runMigrations().then(() => {
    console.log('🎉 Migrations terminées !');
    process.exit(0);
  }).catch((error) => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = { runMigrations }; 