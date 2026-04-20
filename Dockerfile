# Image de base : Node.js 20 Alpine (leger, ~50 Mo)
FROM node:20-alpine

# Dossier de travail dans le container
WORKDIR /app

# Copier les fichiers de dependances d'abord (optimisation cache Docker)
COPY package*.json ./

# Installer les dependances de production uniquement
RUN npm ci --omit=dev

# Copier le reste du code source
COPY . .

# Exposer le port 8080 (meme que Cloud Run)
EXPOSE 8080

# Commande de demarrage
CMD ["node", "server.js"]