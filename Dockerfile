# Production image for The Prophetic Prayer Army.
FROM node:22-slim

WORKDIR /app

# Build tools are available if better-sqlite3 needs to compile from source.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# The host (Railway/Render) injects PORT; the app reads process.env.PORT.
EXPOSE 3000

CMD ["node", "server.js"]
