const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // Vérifier les variables d'environnement
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️  Variables d\'environnement email manquantes. Service email désactivé.');
      this.disabled = true;
      return;
    }

    // Configuration du transporteur email
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false, // true pour 465, false pour les autres ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    this.disabled = false;
    // Vérifier la configuration
    this.verifyConnection();
  }

  async verifyConnection() {
    if (this.disabled) return;
    
    try {
      await this.transporter.verify();
      console.log('✅ Service email configuré avec succès');
    } catch (error) {
      console.error('❌ Erreur configuration email:', error.message);
    }
  }

  // Template de base pour les emails
  generateEmailTemplate(title, content, footerText = '') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667EEA, #764BA2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667EEA; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .highlight { background: #e8f4fd; padding: 15px; border-left: 4px solid #667EEA; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🅿️ Parky</h1>
            <p>${title}</p>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>${footerText || 'Merci de faire confiance à Parky pour vos besoins de stationnement.'}</p>
            <p>© 2025 Parky. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Email de confirmation de réservation
  async sendReservationConfirmation(userEmail, reservationData) {
    const { userName, parkingName, startTime, endTime, totalAmount, reservationId } = reservationData;
    
    const content = `
      <h2>✅ Réservation Confirmée</h2>
      <p>Bonjour <strong>${userName}</strong>,</p>
      <p>Votre réservation a été confirmée avec succès !</p>
      
      <div class="highlight">
        <h3>📋 Détails de votre réservation</h3>
        <p><strong>ID Réservation:</strong> #${reservationId}</p>
        <p><strong>Parking:</strong> ${parkingName}</p>
        <p><strong>Début:</strong> ${new Date(startTime).toLocaleString('fr-FR')}</p>
        <p><strong>Fin:</strong> ${new Date(endTime).toLocaleString('fr-FR')}</p>
        <p><strong>Montant:</strong> ${totalAmount}€</p>
      </div>
      
      <p>Nous vous conseillons d'arriver quelques minutes avant l'heure de début de votre réservation.</p>
      <p>Bon stationnement ! 🚗</p>
    `;

    return this.sendEmail(
      userEmail,
      'Confirmation de réservation - Parky',
      this.generateEmailTemplate('Réservation Confirmée', content)
    );
  }

  // Email d'annulation de réservation
  async sendReservationCancellation(userEmail, reservationData) {
    const { userName, parkingName, startTime, reservationId, refundAmount } = reservationData;
    
    const content = `
      <h2>❌ Réservation Annulée</h2>
      <p>Bonjour <strong>${userName}</strong>,</p>
      <p>Votre réservation a été annulée comme demandé.</p>
      
      <div class="highlight">
        <h3>📋 Détails de la réservation annulée</h3>
        <p><strong>ID Réservation:</strong> #${reservationId}</p>
        <p><strong>Parking:</strong> ${parkingName}</p>
        <p><strong>Date prévue:</strong> ${new Date(startTime).toLocaleString('fr-FR')}</p>
        ${refundAmount ? `<p><strong>Remboursement:</strong> ${refundAmount}€</p>` : ''}
      </div>
      
      <p>Nous espérons vous revoir bientôt pour une prochaine réservation.</p>
    `;

    return this.sendEmail(
      userEmail,
      'Annulation de réservation - Parky',
      this.generateEmailTemplate('Réservation Annulée', content)
    );
  }

  // Email de confirmation de paiement
  async sendPaymentConfirmation(userEmail, paymentData) {
    const { userName, amount, paymentMethod, transactionId, reservationDetails } = paymentData;
    
    const content = `
      <h2>💳 Paiement Confirmé</h2>
      <p>Bonjour <strong>${userName}</strong>,</p>
      <p>Votre paiement a été traité avec succès !</p>
      
      <div class="highlight">
        <h3>🧾 Détails du paiement</h3>
        <p><strong>Montant:</strong> ${amount}€</p>
        <p><strong>Méthode:</strong> ${paymentMethod}</p>
        <p><strong>Transaction ID:</strong> ${transactionId}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</p>
      </div>
      
      ${reservationDetails ? `
        <div class="highlight">
          <h3>🅿️ Réservation associée</h3>
          <p><strong>Parking:</strong> ${reservationDetails.parkingName}</p>
          <p><strong>Période:</strong> ${new Date(reservationDetails.startTime).toLocaleString('fr-FR')} - ${new Date(reservationDetails.endTime).toLocaleString('fr-FR')}</p>
        </div>
      ` : ''}
      
      <p>Ce reçu fait office de justificatif de paiement.</p>
    `;

    return this.sendEmail(
      userEmail,
      'Confirmation de paiement - Parky',
      this.generateEmailTemplate('Paiement Confirmé', content)
    );
  }

  // Email de reçu/facture
  async sendPaymentReceipt(userEmail, receiptData) {
    const { userName, amount, transactionId, items, billingAddress } = receiptData;
    
    const itemsList = items.map(item => 
      `<p>• ${item.description}: ${item.amount}€</p>`
    ).join('');
    
    const content = `
      <h2>🧾 Reçu de Paiement</h2>
      <p>Bonjour <strong>${userName}</strong>,</p>
      <p>Voici votre reçu de paiement officiel :</p>
      
      <div class="highlight">
        <h3>📄 Facture</h3>
        <p><strong>Numéro de transaction:</strong> ${transactionId}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</p>
        <p><strong>Montant total:</strong> ${amount}€</p>
      </div>
      
      <div class="highlight">
        <h3>📋 Détail des services</h3>
        ${itemsList}
      </div>
      
      <p>Conservez ce reçu pour vos archives.</p>
    `;

    return this.sendEmail(
      userEmail,
      `Reçu de paiement #${transactionId} - Parky`,
      this.generateEmailTemplate('Reçu de Paiement', content)
    );
  }

  // Email de notification admin pour demande de retrait
  async sendWithdrawalRequestNotification(adminEmail, withdrawalData) {
    const { ownerName, ownerEmail, amount, paymentMethod, requestId } = withdrawalData;
    
    const content = `
      <h2>💰 Nouvelle Demande de Retrait</h2>
      <p>Une nouvelle demande de retrait nécessite votre attention.</p>
      
      <div class="highlight">
        <h3>👤 Propriétaire</h3>
        <p><strong>Nom:</strong> ${ownerName}</p>
        <p><strong>Email:</strong> ${ownerEmail}</p>
      </div>
      
      <div class="highlight">
        <h3>💵 Détails de la demande</h3>
        <p><strong>ID Demande:</strong> #${requestId}</p>
        <p><strong>Montant:</strong> ${amount}€</p>
        <p><strong>Méthode:</strong> ${paymentMethod}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</p>
      </div>
      
      <p>Veuillez traiter cette demande dans les plus brefs délais.</p>
      <a href="${process.env.FRONTEND_URL}/admin/withdrawal-requests" class="button">Traiter la demande</a>
    `;

    return this.sendEmail(
      adminEmail || 'admin@parky.com',
      'Nouvelle demande de retrait - Parky Admin',
      this.generateEmailTemplate('Demande de Retrait', content)
    );
  }

  // Email de confirmation de retrait au propriétaire
  async sendWithdrawalConfirmation(ownerEmail, withdrawalData) {
    const { ownerName, amount, paymentMethod, status, requestId, processedDate } = withdrawalData;
    
    const isApproved = status === 'approved';
    const statusText = isApproved ? 'Approuvée' : 'Traitée';
    const statusIcon = isApproved ? '✅' : '⚠️';
    
    const content = `
      <h2>${statusIcon} Demande de Retrait ${statusText}</h2>
      <p>Bonjour <strong>${ownerName}</strong>,</p>
      <p>Votre demande de retrait a été ${statusText.toLowerCase()}.</p>
      
      <div class="highlight">
        <h3>💵 Détails</h3>
        <p><strong>ID Demande:</strong> #${requestId}</p>
        <p><strong>Montant:</strong> ${amount}€</p>
        <p><strong>Méthode:</strong> ${paymentMethod}</p>
        <p><strong>Status:</strong> ${statusText}</p>
        <p><strong>Date de traitement:</strong> ${new Date(processedDate).toLocaleString('fr-FR')}</p>
      </div>
      
      ${isApproved ? 
        '<p>Le virement sera effectué dans les 2-3 jours ouvrables.</p>' : 
        '<p>Pour plus d\'informations, contactez notre support.</p>'
      }
    `;

    return this.sendEmail(
      ownerEmail,
      `Demande de retrait ${statusText.toLowerCase()} - Parky`,
      this.generateEmailTemplate(`Retrait ${statusText}`, content)
    );
  }

  // Méthode générique d'envoi d'email
  async sendEmail(to, subject, html, text = null) {
    if (this.disabled) {
      console.log(`📧 Service email désactivé - Email non envoyé à ${to}: ${subject}`);
      return { success: false, error: 'Service email désactivé' };
    }

    try {
      const mailOptions = {
        from: `"Parky" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
        text: text || subject
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email envoyé à ${to}: ${subject}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Erreur envoi email à ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

// Créer une instance unique du service
const emailService = new EmailService();

module.exports = emailService;