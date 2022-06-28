FROM node:18 AS build-env
WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
RUN npm ci 
COPY . ./
RUN npm run build

FROM gcr.io/distroless/nodejs:18
WORKDIR /app
COPY --from=build-env /app ./
USER 1000
CMD ["dist/app.js"]
