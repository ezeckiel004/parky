# FICHIER DE CONFIGURATION FIREBASE

## 🔥 Placez votre fichier Firebase ici

1. **Téléchargez** votre clé de service Firebase depuis la console
2. **Renommez-la** en : `firebase-service-account.json`
3. **Placez-la** dans ce dossier

## 🔒 Sécurité

Ce fichier contient des clés privées sensibles et ne doit **JAMAIS** être commité dans Git.

Il est automatiquement ignoré par `.gitignore`.

## 📁 Structure attendue

```
config/
├── firebase-service-account.json  (à ajouter)
└── README.md  (ce fichier)
```

## ⚠️ Important

Si vous avez déjà commité ce fichier par erreur :

```bash
git rm --cached config/firebase-service-account.json
git commit -m "Remove firebase service account from git"
```