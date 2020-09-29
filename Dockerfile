FROM node:12-alpine AS build
RUN apk add --no-cache make gcc g++ python linux-headers udev tzdata
WORKDIR /app
COPY defaultConfig.json package.json ./
RUN npm install
COPY . .
RUN npm run build && npm prune --production

FROM node:12-alpine as prod
RUN mkdir /app && chown node:node /app
WORKDIR /app
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/defaultConfig.json /app/package.json ./
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/logger ./logger
COPY --chown=node:node --from=build /app/web ./web
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/app.js"]