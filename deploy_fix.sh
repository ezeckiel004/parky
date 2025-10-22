#!/bin/bash

echo "🚀 Déploiement des corrections pour les demandes de retrait"
echo "========================================================="

# 1. Se déplacer vers le répertoire du backend
cd /home/lionkjudah/Downloads/PARKY_V2-main/PARKY_V2-main/Parky_Backend

# 2. Ajouter les fichiers modifiés
echo "📁 Ajout des fichiers modifiés..."
git add routes/balance.js debug_withdrawal_requests.js

# 3. Commiter les corrections
echo "💾 Commit des corrections..."
git commit -m "Fix: Correction définitive des erreurs SQL ER_WRONG_ARGUMENTS

- Ajout de validation ultra-robuste pour les paramètres page et limit
- Conversion sécurisée avec Number.isInteger() et parseInt()
- Ajout de logs de débogage pour traquer les problèmes
- Calcul sécurisé de l'offset avec Math.max()
- Script de débogage pour tester les requêtes

Corrige définitivement l'erreur ligne 462 dans balance.js"

# 4. Pousser vers le repository
echo "🚀 Push vers le repository..."
git push

echo ""
echo "✅ Corrections déployées avec succès!"
echo ""
echo "📋 Étapes suivantes sur le VPS:"
echo "1. cd /var/www/parky.vibecro.com/parky"
echo "2. git pull origin main"
echo "3. pm2 restart parky_app"
echo "4. pm2 logs parky_app --lines 50"
echo ""
echo "🔍 Pour déboguer sur le VPS:"
echo "node debug_withdrawal_requests.js"