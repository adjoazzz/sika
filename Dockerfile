FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["node_modules/.bin/tsx", "src/index.ts"]
