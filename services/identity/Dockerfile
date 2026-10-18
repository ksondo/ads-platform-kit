# Build from the repository root:  docker build -f services/identity/Dockerfile -t ads-identity .
FROM node:22-alpine
WORKDIR /app/services/identity
ENV NODE_ENV=production
COPY services/identity/package.json services/identity/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY services/identity/src ./src
COPY services/identity/migrations ./migrations
COPY packages/identity-client /app/packages/identity-client
USER node
EXPOSE 8084
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8084/health || exit 1
CMD ["node", "src/main.mjs"]
