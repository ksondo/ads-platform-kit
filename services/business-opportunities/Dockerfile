FROM node:22-alpine
WORKDIR /app
COPY services/business-opportunities/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY services/business-opportunities/server.mjs ./server.mjs
COPY services/business-opportunities/discovery.mjs ./discovery.mjs
USER node
ENV PORT=31090
EXPOSE 31090
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:31090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
