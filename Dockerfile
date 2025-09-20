### Build stage
FROM node:20-alpine AS build
LABEL maintainer="nodejs-poolController"

# Install build toolchain only for native deps (serialport, etc.)
RUN apk add --no-cache make gcc g++ python3 linux-headers udev tzdata git

WORKDIR /app

# Leverage Docker layer caching: copy only manifests first
COPY package*.json ./
COPY defaultConfig.json config.json

# Install all deps (including dev) for build
RUN npm ci

# Copy source
COPY . .

# Build Typescript
RUN npm run build

# Remove dev dependencies while keeping a clean node_modules with prod deps only
RUN npm prune --production

### Runtime stage
FROM node:20-alpine AS prod
ENV NODE_ENV=production

# Use existing 'node' user from base image; just ensure work directory exists
WORKDIR /app
RUN mkdir -p /app
RUN mkdir -p /app/logs /app/data /app/backups /app/web/bindings/custom \
	&& chown -R node:node /app/logs /app/data /app/backups /app/web/bindings /app/web/bindings/custom || true

# Copy only the necessary runtime artifacts from build stage
COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/defaultConfig.json ./defaultConfig.json
COPY --chown=node:node --from=build /app/config.json ./config.json
COPY --chown=node:node --from=build /app/README.md ./README.md
COPY --chown=node:node --from=build /app/LICENSE ./LICENSE

USER node

# Default HTTP / HTTPS (if enabled) ports from defaultConfig (http 4200, https 4201)
EXPOSE 4200 4201

# Basic healthcheck (container considered healthy if process responds to tcp socket open)
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
	CMD node -e 'require("net").createConnection({host:"127.0.0.1",port:4200},c=>{c.end();process.exit(0)}).on("error",()=>process.exit(1))' || exit 1

ENTRYPOINT ["node", "dist/app.js"]
