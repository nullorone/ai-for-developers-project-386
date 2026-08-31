FROM node:20.19.5-alpine3.22 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN --mount=type=cache,id=backend-npm,target=/root/.npm,sharing=locked \
  --mount=type=secret,id=npm_ca,required=false \
  --mount=type=secret,id=npmrc,required=false \
  if grep -q 'BEGIN CERTIFICATE' /run/secrets/npm_ca 2>/dev/null; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  if grep -Eq '(^|:)registry|_auth' /run/secrets/npmrc 2>/dev/null; then export NPM_CONFIG_USERCONFIG=/run/secrets/npmrc; fi; \
  npm ci --ignore-scripts --registry="$NPM_REGISTRY" && \
  npm run prisma:generate

FROM dependencies AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# One-shot operational target: Prisma CLI and ts-node are intentionally kept here,
# but never copied into the long-running API image.
FROM dependencies AS operations
COPY tsconfig.json ./
USER node
ENTRYPOINT ["npm"]

FROM node:20.19.5-alpine3.22 AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN --mount=type=cache,id=backend-production-npm,target=/root/.npm,sharing=locked \
  --mount=type=secret,id=npm_ca,required=false \
  --mount=type=secret,id=npmrc,required=false \
  if grep -q 'BEGIN CERTIFICATE' /run/secrets/npm_ca 2>/dev/null; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  if grep -Eq '(^|:)registry|_auth' /run/secrets/npmrc 2>/dev/null; then export NPM_CONFIG_USERCONFIG=/run/secrets/npmrc; fi; \
  npm ci --omit=dev --omit=optional --ignore-scripts --registry="$NPM_REGISTRY" && \
  npm cache clean --force

FROM node:20.19.5-alpine3.22 AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
