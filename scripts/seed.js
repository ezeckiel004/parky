const { executeQuery } = require('../config/database');
const bcrypt = require('bcryptjs');

// Script de seeding pour ajouter des données de test
async function runSeeds() {
  try {
    console.log('🌱 Début du seeding...');

    // Créer des utilisateurs de test
    console.log('👥 Création des utilisateurs de test...');
    
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash('password123', saltRounds);

    // Admin
    await executeQuery(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, status) 
       VALUES ('admin@Parky.com', ?, 'Admin', 'Parky', '+33123456789', 'admin', 'active')
       ON DUPLICATE KEY UPDATE id=id`,
      [hashedPassword]
    );

    // Propriétaires
    await executeQuery(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, status) 
       VALUES ('proprio1@Parky.com', ?, 'Jean', 'Dupont', '+33123456790', 'proprietaire', 'active')
       ON DUPLICATE KEY UPDATE id=id`,
      [hashedPassword]
    );

    await executeQuery(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, status) 
       VALUES ('proprio2@Parky.com', ?, 'Marie', 'Martin', '+33123456791', 'proprietaire', 'active')
       ON DUPLICATE KEY UPDATE id=id`,
      [hashedPassword]
    );

    // Clients
    await executeQuery(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, status) 
       VALUES ('client1@Parky.com', ?, 'Pierre', 'Durand', '+33123456792', 'client', 'active')
       ON DUPLICATE KEY UPDATE id=id`,
      [hashedPassword]
    );

    await executeQuery(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, status) 
       VALUES ('client2@Parky.com', ?, 'Sophie', 'Leroy', '+33123456793', 'client', 'active')
       ON DUPLICATE KEY UPDATE id=id`,
      [hashedPassword]
    );

    // Récupérer les IDs des utilisateurs
    const users = await executeQuery('SELECT id, email, role FROM users WHERE email LIKE "%@Parky.com"');
    const admin = users.find(u => u.role === 'admin');
    const proprietaires = users.filter(u => u.role === 'proprietaire');
    const clients = users.filter(u => u.role === 'client');

    console.log('🏢 Création des parkings de test...');

    // Parking 1 - Centre-ville
    await executeQuery(
      `INSERT INTO parkings (name, address, latitude, longitude, total_spaces, hourly_rate, description, amenities, owner_id, status)
       VALUES (?, ?, 48.8566, 2.3522, 50, 3.50, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE id=id`,
      [
        'Parking Centre-ville',
        '123 Rue de la Paix, 75001 Paris',
        'Parking sécurisé au cœur de Paris',
        '["camera", "guard", "lighting", "roof"]',
        proprietaires[0].id
      ]
    );

    // Parking 2 - Gare
    await executeQuery(
      `INSERT INTO parkings (name, address, latitude, longitude, total_spaces, hourly_rate, description, amenities, owner_id, status)
       VALUES (?, ?, 48.8441, 2.3739, 100, 2.80, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE id=id`,
      [
        'Parking Gare de Lyon',
        '456 Place Louis-Armand, 75012 Paris',
        'Parking à proximité de la gare',
        '["camera", "lighting", "easy_access"]',
        proprietaires[0].id
      ]
    );

    // Parking 3 - Aéroport
    await executeQuery(
      `INSERT INTO parkings (name, address, latitude, longitude, total_spaces, hourly_rate, description, amenities, owner_id, status)
       VALUES (?, ?, 49.0097, 2.5479, 200, 4.20, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE id=id`,
      [
        'Parking Aéroport CDG',
        '789 Rue de l\'Aéroport, 95700 Roissy',
        'Parking longue durée pour aéroport',
        '["camera", "guard", "shuttle", "covered"]',
        proprietaires[1].id
      ]
    );

    // Parking 4 - Commercial
    await executeQuery(
      `INSERT INTO parkings (name, address, latitude, longitude, total_spaces, hourly_rate, description, amenities, owner_id, status)
       VALUES (?, ?, 48.8698, 2.3077, 80, 2.50, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE id=id`,
      [
        'Parking Centre Commercial',
        '321 Avenue des Champs, 75008 Paris',
        'Parking du centre commercial',
        '["camera", "lighting", "free_2h"]',
        proprietaires[1].id
      ]
    );

    // Récupérer les parkings créés
    const parkings = await executeQuery('SELECT id, name, total_spaces FROM parkings WHERE status = "active"');

    console.log('🚗 Création des places de parking...');

    // Créer les places pour chaque parking
    for (const parking of parkings) {
      for (let i = 1; i <= parking.total_spaces; i++) {
        const status = i <= Math.floor(parking.total_spaces * 0.7) ? 'available' : 'occupied';
        const vehicleType = i % 10 === 0 ? 'motorcycle' : 'car';
        
        await executeQuery(
          `INSERT INTO parking_spaces (parking_id, space_number, status, vehicle_type, hourly_rate) 
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE id=id`,
          [parking.id, `A${i.toString().padStart(2, '0')}`, status, vehicleType, 3.50]
        );
      }
    }

    console.log('📅 Création des horaires d\'ouverture...');

    // Horaires d'ouverture pour chaque parking
    for (const parking of parkings) {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      
      for (const day of days) {
        let openTime = '06:00:00';
        let closeTime = '22:00:00';
        let is24h = false;
        let isClosed = false;

        // Parking aéroport ouvert 24h/24
        if (parking.name.includes('Aéroport')) {
          is24h = true;
          openTime = null;
          closeTime = null;
        }
        // Parking commercial fermé le dimanche
        else if (parking.name.includes('Commercial') && day === 'sunday') {
          isClosed = true;
          openTime = null;
          closeTime = null;
        }

        await executeQuery(
          `INSERT INTO parking_operating_hours (parking_id, day_of_week, open_time, close_time, is_24h, is_closed) 
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE id=id`,
          [parking.id, day, openTime, closeTime, is24h, isClosed]
        );
      }
    }

    console.log('📸 Création des images de parking...');

    // Images pour les parkings
    const parkingImages = [
      { parking_id: parkings[0].id, image_url: 'https://example.com/parking1-main.jpg', image_type: 'main' },
      { parking_id: parkings[0].id, image_url: 'https://example.com/parking1-gallery1.jpg', image_type: 'gallery' },
      { parking_id: parkings[1].id, image_url: 'https://example.com/parking2-main.jpg', image_type: 'main' },
      { parking_id: parkings[1].id, image_url: 'https://example.com/parking2-gallery1.jpg', image_type: 'gallery' },
      { parking_id: parkings[2].id, image_url: 'https://example.com/parking3-main.jpg', image_type: 'main' },
      { parking_id: parkings[2].id, image_url: 'https://example.com/parking3-gallery1.jpg', image_type: 'gallery' },
      { parking_id: parkings[3].id, image_url: 'https://example.com/parking4-main.jpg', image_type: 'main' },
      { parking_id: parkings[3].id, image_url: 'https://example.com/parking4-gallery1.jpg', image_type: 'gallery' }
    ];

    for (const image of parkingImages) {
      await executeQuery(
        `INSERT INTO parking_images (parking_id, image_url, image_type, alt_text)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id=id`,
        [image.parking_id, image.image_url, image.image_type, `Image du parking (${image.image_type})`]
      );
    }

    console.log('⭐ Création des avis de test...');

    // Avis pour les parkings
    const reviews = [
      { user_id: clients[0].id, parking_id: parkings[0].id, rating: 5, comment: 'Excellent parking, très propre et sécurisé !' },
      { user_id: clients[1].id, parking_id: parkings[0].id, rating: 4, comment: 'Bon rapport qualité-prix, emplacement pratique.' },
      { user_id: clients[0].id, parking_id: parkings[1].id, rating: 4, comment: 'Parfait pour prendre le train, accès facile.' },
      { user_id: clients[1].id, parking_id: parkings[2].id, rating: 5, comment: 'Idéal pour l\'aéroport, navette gratuite.' }
    ];

    for (const review of reviews) {
      await executeQuery(
        `INSERT INTO reviews (user_id, parking_id, rating, comment, status) 
         VALUES (?, ?, ?, ?, 'approved')
         ON DUPLICATE KEY UPDATE id=id`,
        [review.user_id, review.parking_id, review.rating, review.comment]
      );
    }

    console.log('🔔 Création des notifications de test...');

    // Notifications pour les utilisateurs
    const notifications = [
      { user_id: clients[0].id, type: 'system', title: 'Bienvenue sur Parky', message: 'Merci de vous être inscrit sur notre plateforme !' },
      { user_id: clients[1].id, type: 'promotion', title: 'Offre spéciale', message: '20% de réduction sur votre première réservation !' },
      { user_id: proprietaires[0].id, type: 'system', title: 'Parking créé', message: 'Votre parking a été créé avec succès.' }
    ];

    for (const notification of notifications) {
      await executeQuery(
        `INSERT INTO notifications (user_id, type, title, message) 
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id=id`,
        [notification.user_id, notification.type, notification.title, notification.message]
      );
    }

    console.log('✅ Seeding terminé avec succès !');
    console.log('📊 Données créées :');
    console.log(`   - ${users.length} utilisateurs`);
    console.log(`   - ${parkings.length} parkings`);
    console.log('   - Places de parking pour chaque parking');
    console.log('   - Horaires d ouverture');
    console.log('   - Images de parking');
    console.log('   - Avis utilisateurs');
    console.log('   - Notifications');

    console.log('\n🔑 Comptes de test créés :');
    console.log('   Admin: admin@Parky.com / password123');
    console.log('   Propriétaire 1: proprio1@Parky.com / password123');
    console.log('   Propriétaire 2: proprio2@Parky.com / password123');
    console.log('   Client 1: client1@Parky.com / password123');
    console.log('   Client 2: client2@Parky.com / password123');

  } catch (error) {
    console.error('❌ Erreur lors du seeding:', error);
    process.exit(1);
  }
}

// Exécuter le seeding si le script est appelé directement
if (require.main === module) {
  runSeeds().then(() => {
    console.log('🎉 Seeding terminé !');
    process.exit(0);
  }).catch((error) => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = { runSeeds }; 