FROM node:24.11.1-alpine3.23 AS mock-auth
WORKDIR /app
COPY docker/public/mock-auth ./
CMD ["node", "server.mjs"]

FROM node:24.11.1-alpine3.23 AS dependencies
WORKDIR /app
COPY package*.json ./
COPY emss-fallback ./emss-fallback
# Use the same public dependency preparation as optional host tooling.
RUN npm install -g npm@11.17.0 && npm run setup:public:packages

FROM dependencies AS build
COPY . .
ENV VITE_PUBLIC_REMOTE_LOG_LEVEL=off
ARG GIT_COMMIT=public
ENV GIT_COMMIT=$GIT_COMMIT
RUN npm run build && npm run automerge:seed:build

FROM dependencies AS api
COPY --from=build /app/.local /app/.local
COPY --from=build /app/src/server/database /app/src/server/database
COPY --from=build /app/tsconfig.json /app/tsconfig.json
COPY docker/public/seed-demo.mjs /app/docker/public/seed-demo.mjs
ENV NODE_ENV=production
RUN apk add --no-cache rsync tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npm run migration:up && npm run automerge:migration:run && node docker/public/seed-demo.mjs && npm run api"]

FROM nginx:1.29.0-alpine AS nginx
RUN apk add --no-cache openssl
COPY --from=build /app/.local/vite/dist /usr/share/nginx/html
COPY docker/nginx/loggedin.html docker/nginx/loggedout.html /usr/share/nginx/html/
COPY docker/public/nginx.conf /etc/nginx/nginx.conf
COPY docker/public/require-auth.conf /etc/nginx/require-auth.conf
COPY docker/public/entrypoint.sh /docker-entrypoint.d/40-public-tls.sh
RUN chmod +x /docker-entrypoint.d/40-public-tls.sh && mkdir -p /var/cache/nginx/cog
