# Déploiement version STABLE minimale
Write-Host "🚀 Déploiement version STABLE" -ForegroundColor Cyan

# Nettoyage BDD
Write-Host "🧹 Nettoyage base de données..." -ForegroundColor Yellow
node cleanup_affaires.js

# Git
git add index.html server.js
git commit -m "fix: Version stable minimale - affaires fonctionnelles"
git push

# Deploy
Write-Host "☁️ Déploiement Cloud Run..." -ForegroundColor Yellow
gcloud run deploy pipeline-texaswin --source . --region europe-west1 --allow-unauthenticated --set-env-vars DB_HOST=51.159.24.123,DB_USER=Pipeline_Texaswin,DB_PASSWORD=Connect@pipeline2026,DB_NAME=rdb,DB_PORT=3035,JWT_SECRET=votre_secret_jwt_ultra_securise_2024

Write-Host "✅ DÉPLOYÉ !" -ForegroundColor Green
