# AtriumDesk API server (Node/Express) — image for Cloudflare Containers.
# Built and pushed by `wrangler deploy` from cloudflare/ (linux/amd64).
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# package-lock.json is not committed, so this is `npm install`, not `npm ci`.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY . .

# uploads/ is scratch space only: with R2 configured every upload is also
# stored in the bucket (services/fileStore.js), since this disk is wiped
# whenever the container sleeps or is redeployed.
RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "server.js"]
