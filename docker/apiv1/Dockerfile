# When building via kaniko in CI, the dependency proxy will cache image from Docker Hub.
# For local builds, Docker pulls directly from Docker Hub
FROM node:24.11.1-alpine3.23 AS base

# Set the working directory. It will create if doesn't exist
WORKDIR /app

# Make GIT_COMMIT available inside docker/kaniko so it can be baked into the code at build time
# The GIT_COMMIT value is passed in using MAP_ENV_VARS_TO_BUILD_ARGS from the job pipeline.
# When building this container locally, this is not available so "localDev" will be used as default value
ARG GIT_COMMIT=localDev
ENV GIT_COMMIT=$GIT_COMMIT

# The * after npmrc ensure copy operation will not fail if the file does not exist
COPY .npmrc* .
COPY package*.json .

# # # # # # # #
# BUILD image #
# # # # # # # #

# Use a different stage for building so we can reduce the size of the final prod image
FROM base AS build

# Install all packages including devDependencies
# Use a cache mount for faster installs. Cache mounts can be used by buildx, but not kaniko
#     - cache mount persists between builds and Docker Desktop restarts
#     - cache remains until pruned with commands like "docker builder prune"
#     - cache is stored in a location managed by Docker Desktop VM and is not in the image
# Since we can't use the cache on kaniko, this cache is only beneficial for (re)building locally
# buildx is the the component that our Docker Desktop uses to build images with BuildKit.
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci

# Copy the rest of the files and build the app
COPY . /app

RUN npm run api:build

# # # # # # # #
# PROD image  #
# # # # # # # #

# Our final build image. This should be as small as possible
FROM base AS prod

# Copy over only stuff we need to keep the image small
# esbuild bundle from the build stage
COPY --from=build /app/.local/express/dist/api/api.js /app/.local/express/dist/api/api.js
COPY --from=build /app/.local/automerge/dist /app/.local/automerge/dist
# tsconfig, mikro config, and db migrations/models required for ts-node / mikro
COPY --from=build /app/src/server/database /app/src/server/database
COPY --from=build /app/tsconfig.json /app
# copy schemas over
COPY --from=build /app/.local/schemas /app/.local/schemas

# Run node with production config
ENV NODE_ENV=production

# Install runtime dependencies only, omit the devDependencies
# Use the cache mount to avoid re-downloading and speed up install (only for local builds)
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev

# Install system packages:
# - rsync - allow copying files when duplicating missions
# - tini - init system for running node as PID 1
#   <https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#handling-kernel-signals>
RUN apk add --no-cache \
  rsync \
  tini=0.19.0-r3

ENTRYPOINT ["/sbin/tini", "--"]

# This image is intended to be run with docker-compose.
# Migration runs in three phases so every historical database dump can cross the two
# SQL-to-Automerge data boundaries safely. First, create initial Automerge documents before
# mission_db is removed. Second, run document backfills before grid_db is removed. Finally,
# apply all remaining MikroORM migrations and start the API.
CMD ["/bin/sh", "-c", "npm run migration:run && npm run api"]
