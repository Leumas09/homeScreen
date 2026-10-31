# Image de l'app maroubra : le serveur (hub) empaqueté en un seul fichier et les fichiers web.
# Construite par le workflow GitHub et poussée dans l'ACR du socle (crkiwiapps).

# Image de base épinglée par empreinte (node:22-alpine au 31/10/2026).
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/hub/package.json apps/hub/
COPY packages/sky/package.json packages/sky/
COPY packages/core/package.json packages/core/
RUN npm ci --no-audit --no-fund
COPY apps apps
COPY packages packages
RUN npm run build -w @maroubra/web && npm run build -w @maroubra/hub

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
ARG VERSION=dev
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/web APP_VERSION=${VERSION}
WORKDIR /app
COPY --from=build /src/apps/hub/dist/index.mjs ./index.mjs
COPY --from=build /src/apps/web/dist ./web
USER node
EXPOSE 8080
CMD ["node", "index.mjs"]
