#!/bin/bash

echo "🚀 Test de la fonctionnalité de suppression de compte..."

# Vérifier que le serveur est en marche
echo "📡 Test de connectivité au serveur..."

# Test de la page de connexion
echo "🔐 Test de la page de connexion de suppression..."
curl -I http://localhost:3000/api/auth/account-deletion/login

echo ""
echo "📝 Test de la page de formulaire..."
curl -I http://localhost:3000/api/auth/account-deletion/form

echo ""
echo "🔧 Test de l'API de connexion..."
curl -X POST http://localhost:3000/api/auth/account-deletion/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrongpassword"}' \
  -w "\nStatus: %{http_code}\n"

echo ""
echo "✅ Tests terminés!"
echo ""
echo "📋 URLs à tester dans le navigateur:"
echo "   - Page de connexion: http://localhost:3000/api/auth/account-deletion/login"
echo "   - Formulaire: http://localhost:3000/api/auth/account-deletion/form"
echo ""
echo "🐛 Si vous avez encore des erreurs CSP, vérifiez les logs du serveur"
echo "    et assurez-vous que les fichiers JavaScript externes sont bien servis"