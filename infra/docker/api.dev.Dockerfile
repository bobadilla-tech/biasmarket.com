FROM node:24-slim
RUN corepack enable pnpm && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
