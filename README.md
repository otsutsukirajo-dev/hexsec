# PointagePro — Application de Pointage QR Code

## 📱 Application Progressive Web App (PWA)

Application complète de gestion de présence avec :
- **QR Code** + **Géolocalisation GPS**
- **Mode Offline-First** (fonctionne sans internet)
- **Interface responsive** : Mobile, Tablette, PC
- **Dashboard RH** avec export Excel/CSV
- **Dark mode** inclus

## 🚀 Lancement rapide

### Option 1 — Navigateur direct
Ouvrir `index.html` dans Chrome/Firefox/Safari

### Option 2 — Serveur local (recommandé pour PWA)
```bash
# Python 3
python -m http.server 8080

# Node.js
npx serve .

# Puis ouvrir : http://localhost:8080
```

### Option 3 — Installer comme app (PWA)
1. Ouvrir dans Chrome
2. Cliquer sur l'icône "Installer" dans la barre d'adresse
3. Confirmer l'installation → fonctionne comme une app native

### Option 4 — App desktop (Electron)
```bash
npm install
npm run electron
# Génère un .exe via : npm run build:win
```

## 📂 Structure des fichiers
```
pointagepro/
├── index.html        # Application principale (tout-en-un)
├── manifest.json     # Config PWA
├── sw.js             # Service Worker (offline)
├── package.json      # Config Electron (app desktop)
└── README.md         # Documentation
```

## 👤 Comptes démo
| Nom | Rôle | Description |
|-----|------|-------------|
| Jean Dupont | Employé | Pointage QR Code |
| Marie Martin | Manager RH | Dashboard + Export |

## ✨ Fonctionnalités
- ✅ Connexion avec session persistante
- ✅ Scanner QR Code (simulé, remplacer par jsQR en prod)
- ✅ Géolocalisation GPS automatique
- ✅ Mode hors-ligne avec sync automatique
- ✅ Historique avec filtres
- ✅ Profil utilisateur éditable
- ✅ Dashboard manager complet
- ✅ Export CSV & Excel
- ✅ Thème clair/sombre
- ✅ Notifications toast
- ✅ Animations fluides

## 🔧 Intégration production
- Remplacer la simulation scan par **jsQR** ou **ZXing**
- Connecter à **Firebase Firestore** ou **Supabase**
- Activer **Background Sync** via Service Worker
- Stocker offline dans **IndexedDB** (via idb-keyval)
