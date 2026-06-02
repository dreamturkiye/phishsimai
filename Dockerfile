FROM node:20-alpine
WORKDIR /app

# Install pnpm explicitly at correct version
RUN npm install -g pnpm@10.4.1

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches/

# Install all deps
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY . .

# Clear vite cache and build
RUN rm -rf .vite client/.vite 2>/dev/null || true
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/index.js"]
