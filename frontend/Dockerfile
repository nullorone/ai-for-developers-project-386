FROM node:20.19.5-alpine3.22 AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN --mount=type=cache,id=frontend-npm,target=/root/.npm,sharing=locked \
  --mount=type=secret,id=npm_ca,required=false \
  --mount=type=secret,id=npmrc,required=false \
  if grep -q 'BEGIN CERTIFICATE' /run/secrets/npm_ca 2>/dev/null; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  if grep -Eq '(^|:)registry|_auth' /run/secrets/npmrc 2>/dev/null; then export NPM_CONFIG_USERCONFIG=/run/secrets/npmrc; fi; \
  npm ci --registry="$NPM_REGISTRY"

COPY frontend/tsconfig.json ./
COPY frontend/vite.config.ts frontend/index.html ./
COPY frontend/src ./src
COPY frontend/public ./public
COPY frontend/tests ./tests
COPY openapi.yaml /openapi.yaml

# This value is public and becomes part of the browser bundle. Runtime API_BASE_URL
# can override it through /config.js without rebuilding the image.
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_BASE_PATH=/
RUN VITE_API_BASE_URL="$VITE_API_BASE_URL" VITE_BASE_PATH="$VITE_BASE_PATH" npm run build

FROM nginxinc/nginx-unprivileged:1.28.0-alpine3.21 AS runtime

COPY --chown=101:101 frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 frontend/nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --chown=101:101 --chmod=755 frontend/docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html

ENV API_BASE_URL=/api/v1
USER root
RUN chown 101:101 /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
