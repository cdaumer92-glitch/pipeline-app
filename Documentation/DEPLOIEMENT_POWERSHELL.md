# ⚡ DÉPLOIEMENT avec PowerShell (Windows)

## 📋 Prérequis
- Le fichier `index_avec_autosave.html` téléchargé sur votre ordinateur
- PowerShell ouvert dans le dossier de votre projet

---

## 🚀 Étapes de déploiement

### 1️⃣ Ouvrir PowerShell dans votre dossier projet

1. Ouvrez l'**Explorateur Windows**
2. Naviguez vers votre dossier projet (celui qui contient `public/`)
3. Dans la barre d'adresse, tapez `powershell` et appuyez sur Entrée
4. PowerShell s'ouvre dans ce dossier

---

### 2️⃣ Faire un backup de l'ancien fichier

```powershell
# Renommer l'ancien index.html en backup
Move-Item -Path "public\index.html" -Destination "public\index_backup_20250202.html"
```

---

### 3️⃣ Copier le nouveau fichier

**Supposons que vous avez téléchargé `index_avec_autosave.html` dans votre dossier Téléchargements :**

```powershell
# Copier depuis Téléchargements vers public/
Copy-Item -Path "$env:USERPROFILE\Downloads\index_avec_autosave.html" -Destination "public\index.html"
```

**OU si le fichier est ailleurs :**

```powershell
# Remplacez C:\Chemin\vers\votre\fichier par le vrai chemin
Copy-Item -Path "C:\Chemin\vers\votre\fichier\index_avec_autosave.html" -Destination "public\index.html"
```

**OU la méthode manuelle (plus simple) :**
- Glissez-déposez `index_avec_autosave.html` dans le dossier `public\`
- Renommez-le en `index.html`

---

### 4️⃣ Vérifier que le fichier est bien là

```powershell
# Lister les fichiers du dossier public
Get-ChildItem public\
```

Vous devriez voir :
- `index.html` (le nouveau)
- `index_backup_20250202.html` (l'ancien)

---

### 5️⃣ Ajouter le fichier à Git

```powershell
git add public/index.html
```

---

### 6️⃣ Commit

```powershell
git commit -m "fix: Auto-save PDF apres upload"
```

---

### 7️⃣ Push vers Google Cloud

```powershell
git push
```

**Vous verrez quelque chose comme :**
```
Énumération des objets: 7, fait.
Décompte des objets: 100% (7/7), fait.
...
To https://source.developers.google.com/...
   abc1234..def5678  main -> main
```

---

### 8️⃣ Attendre le déploiement

1. Allez sur **Google Cloud Console** : https://console.cloud.google.com
2. Menu (☰) → **Cloud Run**
3. Cliquez sur votre service
4. Vous verrez un nouveau déploiement en cours (⏳)
5. Attendez qu'il devienne vert (✅) - environ 2-3 minutes

---

### 9️⃣ Tester !

1. Rafraîchissez votre application (F5 ou Ctrl+F5)
2. Ouvrez un prospect (Kidiwi par exemple)
3. Cliquez sur "Modifier"
4. Uploadez un PDF
5. Le message devrait dire : **"✅ PDF uploadé et enregistré automatiquement !"**
6. Fermez le formulaire
7. Rouvrez le prospect
8. Cliquez sur "👁️ Visionner"
9. **Ça devrait marcher !** 🎉

---

## 🆘 En cas de problème

### Si Git dit "nothing to commit" :

```powershell
# Vérifier le statut
git status
```

Si vous ne voyez pas `public/index.html` en rouge ou vert, c'est que le fichier n'a pas changé.

### Si vous avez une erreur lors du push :

```powershell
# D'abord pull les changements
git pull

# Puis re-push
git push
```

### Si le déploiement échoue sur Cloud Run :

1. Regardez les logs dans Cloud Run
2. Vérifiez qu'il n'y a pas d'erreur de syntaxe JavaScript
3. Partagez-moi l'erreur

---

## ✅ Checklist

- [ ] Backup de l'ancien index.html
- [ ] Nouveau fichier copié dans public/
- [ ] `git add` effectué
- [ ] `git commit` effectué  
- [ ] `git push` effectué
- [ ] Déploiement terminé sur Cloud Run (vert)
- [ ] Application rafraîchie (Ctrl+F5)
- [ ] Test d'upload de PDF réussi
- [ ] Visualisation du PDF OK

---

## 📞 Besoin d'aide ?

Si vous bloquez quelque part :
1. Faites un screenshot de l'erreur
2. Dites-moi à quelle étape vous êtes bloqué
3. Je vous aide !
