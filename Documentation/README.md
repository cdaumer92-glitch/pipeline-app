# 🚀 Pipeline Commerciaux - Guide de démarrage

Une application de gestion de pipeline pour toi et un autre commercial, avec suivi des prospects et des activités.

## ⚙️ Installation rapide (5 min)

### 1️⃣ **Prérequis**
- Node.js (v14+) → Télécharge à https://nodejs.org
- Un navigateur moderne (Chrome, Firefox, Safari, Edge)

### 2️⃣ **Installation du backend**

```bash
# Accède au dossier
cd /home/claude/pipeline-app

# Installe les dépendances
npm install

# Lance le serveur (reste ouvert)
npm start
```

Tu devrais voir :
```
✓ BD connectée
🚀 Serveur lancé sur http://localhost:5000
📊 BD SQLite : pipeline.db
```

### 3️⃣ **Ouvre l'app dans le navigateur**

Accède à : **http://localhost:5000/index.html**

(Attends que le serveur soit lancé avant d'ouvrir le navigateur)

---

## 📝 Première utilisation

### **S'inscrire**
1. Clique sur "Pas encore inscrit ?"
2. Remplis : Nom, Email, Mot de passe
3. Clique "S'inscrire"

### **Ajouter des prospects**
1. Clique "+ Nouveau prospect"
2. Remplis les infos (nom, contact, montants, etc.)
3. L'app calcule automatiquement le total et la valeur attendue
4. Clique "Enregistrer"

### **Ajouter des activités**
1. Clique sur un prospect dans la liste gauche
2. Scroll en bas → Section "Suivi des activités"
3. Sélectionne le type (Appel, Email, Réunion...)
4. Écris le détail
5. Clique "Ajouter"

### **Filtrer**
- **Barre de recherche** : trouve un nom, contact ou email
- **Filtres par statut** : Prospection, Devis, Négociation, Signé, Perdu

---

## 🗂️ Structure des fichiers

```
pipeline-app/
├── server.js          # Backend Express + SQLite
├── App.jsx            # Frontend React (toute l'app)
├── index.html         # Fichier HTML principal
├── package.json       # Dépendances Node
├── pipeline.db        # Base de données (créée auto)
└── README.md          # Ce fichier
```

---

## 🔑 Fonctionnalités

### **Gestion des prospects**
- ✅ Ajouter/modifier/supprimer
- ✅ Suivi du statut (Prospection → Signé ou Perdu)
- ✅ 4 montants différents (Setup, Abo mensuel, Formation, Matériel)
- ✅ Calcul auto du total
- ✅ % de chance et valeur attendue (Total × Chance%)
- ✅ Coordonnées du contact principal

### **Suivi des activités**
- ✅ 6 types d'actions (Appel, Email, Réunion, Devis, Relance, Autre)
- ✅ Historique complet par prospect
- ✅ Dates automatiques

### **Collaboration**
- ✅ Authentification simple (email/mdp)
- ✅ Chaque utilisateur gère ses propres prospects
- ✅ Pour partager : crée un compte commun ou une améliorations future

### **Filtres & Recherche**
- ✅ Filtre par statut
- ✅ Recherche par nom, contact ou email
- ✅ Vue détaillée par prospect

---

## 🔐 Données

Tout est stocké en local dans **pipeline.db** (SQLite).

**Personne d'autre ne peut y accéder** sauf si vous partagez le fichier ou l'URL.

---

## 🛠️ Dépannage

### **"Erreur de connexion"**
- Vérifie que le serveur est lancé (`npm start`)
- Attends 2-3 secondes après le démarrage

### **"BD en erreur"**
- Supprime `pipeline.db`
- Redémarre le serveur (`npm start`)
- La BD se recréera toute seule

### **L'app ne charge pas**
- Rafraîchis le navigateur (Ctrl+R ou Cmd+R)
- Vérifie que tu es sur http://localhost:5000/index.html (pas juste :5000)

### **Les modifications ne s'enregistrent pas**
- Vérifie la console (F12 → Onglet Console) pour les erreurs
- Redémarre le serveur

---

## 📊 Améliorations futures possibles

- Exportation en Excel/CSV
- Graphiques de pipeline
- Notifications/alertes
- Partage de pipelines entre 2 commerciaux
- Déploiement sur serveur (Vercel + Supabase)
- Mobile app (React Native)

---

## ❓ Questions ?

- **API Rest complète** → code dans `server.js`
- **Interface** → code dans `App.jsx`
- Tout est commenté et facile à modifier

---

## 🚢 Déploiement futur (quand tu es prêt)

Si tu veux partager avec l'autre commercial :

**Option 1 : Heroku (gratuit)**
```bash
npm install -g heroku-cli
# ... [instructions Heroku]
```

**Option 2 : Vercel + Supabase** (plus moderne)
- Frontend sur Vercel
- BD sur Supabase
- Gratuit jusqu'à limites raisonnables

**On peut le faire ensemble si tu veux !** 🚀

---

**Bon développement !** 💪
