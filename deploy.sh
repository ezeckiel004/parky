#!/bin/bash

# Script de déploiement automatique pour Parky Backend
# Usage: ./deploy.sh [environment] [version]

set -e

# Configuration
APP_NAME="parky-backend"
BACKUP_DIR="/var/backups/parky"
LOG_DIR="/var/log/parky"
APP_DIR="/var/www/parky-backend"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Vérifier les prérequis
check_prerequisites() {
    log "Vérification des prérequis..."
    
    if ! command -v node &> /dev/null; then
        error "Node.js n'est pas installé"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        error "npm n'est pas installé"
        exit 1
    fi
    
    if ! command -v pm2 &> /dev/null; then
        warning "PM2 n'est pas installé, installation..."
        npm install -g pm2
    fi
    
    if ! command -v mysql &> /dev/null; then
        error "MySQL n'est pas installé"
        exit 1
    fi
}

# Sauvegarde de la base de données
backup_database() {
    log "Sauvegarde de la base de données..."
    
    mkdir -p $BACKUP_DIR
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    
    mysqldump -u root -p parky_app > "$BACKUP_DIR/parky_backup_$TIMESTAMP.sql"
    
    if [ $? -eq 0 ]; then
        log "Sauvegarde réussie: $BACKUP_DIR/parky_backup_$TIMESTAMP.sql"
    else
        error "Échec de la sauvegarde"
        exit 1
    fi
}

# Installation des dépendances
install_dependencies() {
    log "Installation des dépendances..."
    
    cd $APP_DIR
    npm ci --production
}

# Déploiement avec PM2
deploy_with_pm2() {
    log "Déploiement avec PM2..."
    
    cd $APP_DIR
    
    # Arrêter l'application si elle tourne
    pm2 stop $APP_NAME || true
    pm2 delete $APP_NAME || true
    
    # Démarrer l'application
    pm2 start ecosystem.config.js --env production
    pm2 save
    
    log "Application déployée et démarrée avec PM2"
}

# Tests de santé
health_check() {
    log "Vérification de la santé de l'application..."
    
    sleep 5
    
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
    
    if [ "$RESPONSE" = "200" ]; then
        log "Application fonctionne correctement (HTTP 200)"
    else
        error "Application ne répond pas correctement (HTTP $RESPONSE)"
        exit 1
    fi
}

# Nettoyage des anciens déploiements
cleanup() {
    log "Nettoyage des anciens fichiers..."
    
    # Garder seulement les 5 dernières sauvegardes
    cd $BACKUP_DIR
    ls -t | tail -n +6 | xargs -r rm
    
    log "Nettoyage terminé"
}

# Fonction principale
main() {
    log "Début du déploiement de $APP_NAME"
    
    check_prerequisites
    backup_database
    install_dependencies
    deploy_with_pm2
    health_check
    cleanup
    
    log "Déploiement terminé avec succès!"
    log "Application disponible sur: http://localhost:3000"
    log "Santé de l'API: http://localhost:3000/api/health"
}

# Gestion des erreurs
trap 'error "Déploiement échoué à la ligne $LINENO"' ERR

# Exécution
main "$@"
