# ── Build stage ──
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production stage ──
FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup -g 1001 -S candor && \
    adduser -S candor -u 1001

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

USER candor

EXPOSE 3100 3101

CMD ["node", "dist/cli.js", "start"]
