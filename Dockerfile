FROM node:alpine as controllerbuild
RUN apk add --no-cache make gcc g++ python linux-headers udev tzdata
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build-prod

FROM node:alpine as releasecontainer
RUN mkdir /app && chown node:node /app
COPY --chown=node:node --from=controllerbuild /app/dist/compiled /app

USER node
WORKDIR /app

ENTRYPOINT ["node", "/app/index.js"]
