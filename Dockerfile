# Violin Coach: static PWA served by unprivileged nginx.
# Stage 1 builds the Vite app; stage 2 only carries the compiled files (no Node in production).

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime

# Links the GHCR package to this repository (so it inherits its visibility and shows the source)
LABEL org.opencontainers.image.source="https://github.com/BenjaminDebotte/violin" \
      org.opencontainers.image.description="Violin Coach: upload a score and play it" \
      org.opencontainers.image.licenses="UNLICENSED"

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Where the shared score library lives. The cluster mounts a volume here; a plain
# `docker run` just uses this folder.
USER root
RUN mkdir -p /srv/library && chown 101:101 /srv/library
USER 101

# Runs as uid 101 (nginx) and listens on 8080 (app) and 8081 (library), so no privileges are needed.
EXPOSE 8080 8081

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
