# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--experimental-sqlite

WORKDIR /app

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

ARG GIT_BRANCH=dev
ENV NEXT_PUBLIC_GIT_BRANCH=${GIT_BRANCH}

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

ARG GIT_BRANCH=dev

ENV HOSTNAME=0.0.0.0
ENV MUSIC_LIBRARY_PATH=/music
ENV NEXT_PUBLIC_GIT_BRANCH=${GIT_BRANCH}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS=--experimental-sqlite
ENV PGID=1000
ENV PORT=3000
ENV PUID=1000

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    gosu \
    python3 \
    python3-pip \
    tini \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m pip install --no-cache-dir --break-system-packages --upgrade --pre "yt-dlp[default]" \
  && mkdir -p /config /music \
  && chown -R node:node /app /config \
  && chown node:node /music

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/spotifybu-entrypoint

EXPOSE 3000

VOLUME ["/config", "/music"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/app-info').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["tini", "--", "spotifybu-entrypoint"]
CMD ["node", "server.js"]
