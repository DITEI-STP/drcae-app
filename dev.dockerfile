FROM node:22-alpine
WORKDIR /opt/app
COPY package*.json ./
RUN npm ci
EXPOSE 80
CMD ["npm", "run", "dev"]
