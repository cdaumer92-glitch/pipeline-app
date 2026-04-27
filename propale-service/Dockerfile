# Image Node.js sur Debian (au lieu d'Alpine) pour avoir Python + libs facilement
FROM node:20-slim

# Installer Python 3 + libs nécessaires
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-pil \
    python3-defusedxml \
    python3-numpy \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installer les deps Node
COPY package.json ./
RUN npm install --omit=dev

# Copier le code et le skill
COPY server.js ./
COPY skill ./skill

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
