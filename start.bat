@echo off
chcp 65001 > nul
echo.
echo 🚀 Pipeline Commerciaux - Démarrage sur Windows...
echo.
echo Étape 1: Installation des dépendances...
call npm install --silent
echo.
echo ✅ Installation terminée
echo.
echo 🎯 OUVRE CE LIEN DANS TON NAVIGATEUR:
echo    http://localhost:5000/index.html
echo.
echo 📝 Attends que le serveur soit lancé (environ 2-3 secondes)
echo ⚠️  Garde cette fenêtre ouverte pendant que tu utilises l'app
echo 💡 Appuie sur Ctrl+C pour arrêter
echo.
call npm start
pause
