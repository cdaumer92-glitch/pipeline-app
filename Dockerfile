# ─────────────────────────────────────────────────────────────
# Stage 1 : build du front avec Vite (JSX précompilé -> dist/)
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
# Dépendances complètes (dev incluses : vite, react…) pour builder.
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2 : runtime (serveur Express + dist/)
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
# Dépendances de production uniquement (le serveur n'a pas besoin de React/Vite).
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Récupère le front buildé depuis l'étape 1.
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "server.js"]
