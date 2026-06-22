# PulseBoost — serveur licence + effecteur Discord (un seul process)
FROM node:20-slim

# better-sqlite3 a besoin d'un toolchain de build pour son module natif.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

# Base SQLite sur un volume persistant.
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787

CMD ["node", "server.js"]
