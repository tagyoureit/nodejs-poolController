FROM node:current as build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

ENTRYPOINT ["node", "dist/app.js"]