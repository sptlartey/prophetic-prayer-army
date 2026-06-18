# Production image for The Prophetic Prayer Army.
# better-sqlite3 ships prebuilt binaries for linux/glibc x64, so node:22-slim
# can install it without a compiler — keeping the image small and the build fast.
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

ENV NODE_ENV=production
# The host injects PORT; the app reads process.env.PORT.
EXPOSE 3000

CMD ["node", "server.js"]
