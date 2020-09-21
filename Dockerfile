FROM node:current as controllerbuild
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build-prod

FROM node:current as releasecontainer
COPY --from=controllerbuild /app/dist/compiled /app
WORKDIR /app
ENTRYPOINT ["node", "/app/index.js"]
