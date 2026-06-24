# syntax=docker/dockerfile:1.7
# Dev image — dependency install runs conditionally at startup via
# bin/entrypoint.dev.sh using a checksum guard.
FROM node:22-alpine

WORKDIR /opt/app

RUN apk add --no-cache bash

ENV NODE_ENV=development
ENV PATH=/opt/app/node_modules/.bin:$PATH

EXPOSE 80

CMD ["bash", "bin/entrypoint.dev.sh"]
