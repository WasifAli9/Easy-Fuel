# syntax=docker/dockerfile:1

# --- Build: Vite SPA + esbuild server bundle ---------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_* must be present at build time (baked into the SPA)
ARG VITE_MAPBOX_TOKEN=
ARG VITE_WS_URL=
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN \
    VITE_WS_URL=$VITE_WS_URL \
    NODE_ENV=production

RUN npm run build

# --- Runtime: production node_modules + dist only ----------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5002 \
    HOST=0.0.0.0 \
    LOCAL_STORAGE_DIR=/app/storage

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN mkdir -p /app/storage && chown -R node:node /app

USER node
EXPOSE 5002

# Avoid cross-env (devDependency); NODE_ENV is set above
CMD ["node", "dist/index.js"]
