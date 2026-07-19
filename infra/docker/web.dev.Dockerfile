FROM node:26-slim
RUN npm install -g corepack@latest && corepack enable pnpm && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
