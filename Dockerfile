FROM node:22-alpine AS builder
WORKDIR /opt/app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_APP_BASE_URL=/app/
ARG VITE_API_BASE_URL=/api
ENV VITE_APP_BASE_URL=$VITE_APP_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine
COPY --from=builder /opt/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
