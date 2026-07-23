FROM node:22-alpine AS builder
WORKDIR /opt/app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_APP_BASE_URL=/app/
ARG VITE_API_BASE_URL=/api
ARG VITE_CENTRIFUGO_URL=/connection/websocket
# BUILD_VERSION is passed on every `bin/promote build`/`publish` invocation
# (see bin/src/promote-exec.sh) as VERSION + a per-build git-sha/timestamp
# suffix, so every image gets a distinct VITE_DRCAE_APP_VERSION even when
# VERSION itself hasn't been bumped — this is what forces the webview/PWA
# service worker to detect a real update on each new release.
ARG BUILD_VERSION=0.0.0-dev
ENV VITE_APP_BASE_URL=$VITE_APP_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_CENTRIFUGO_URL=$VITE_CENTRIFUGO_URL
ENV VITE_DRCAE_APP_VERSION=$BUILD_VERSION
RUN npm run build

FROM nginx:alpine
COPY --from=builder /opt/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
