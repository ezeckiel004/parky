#!/bin/bash

echo "🚀 Création de la table account_deletions..."

# Vérifier si le fichier SQL existe
if [ ! -f "sql/account_deletions_table.sql" ]; then
    echo "❌ Fichier SQL introuvable: sql/account_deletions_table.sql"
    exit 1
fi

# Lire les variables d'environnement depuis .env
if [ -f ".env" ]; then
    export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

# Vérifier les variables d'environnement
if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
    echo "❌ Variables d'environnement de base de données manquantes"
    echo "Vérifiez DB_HOST, DB_USER, DB_PASSWORD, DB_NAME dans le fichier .env"
    exit 1
fi

echo "📊 Connexion à la base de données: $DB_NAME sur $DB_HOST"

# Exécuter le script SQL
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < sql/account_deletions_table.sql

if [ $? -eq 0 ]; then
    echo "✅ Table account_deletions créée avec succès!"
    echo "✅ Colonne status de la table users mise à jour!"
else
    echo "❌ Erreur lors de la création de la table"
    exit 1
fi

echo "🎉 Configuration de la suppression de compte terminée!"
echo ""
echo "📝 URLs disponibles:"
echo "   - Page de connexion: http://localhost:3000/api/auth/account-deletion/login"
echo "   - Formulaire de suppression: http://localhost:3000/api/auth/account-deletion/form"
echo ""
echo "🔧 API endpoints:"
echo "   - POST /api/auth/account-deletion/login"
echo "   - POST /api/auth/account-deletion/submit"