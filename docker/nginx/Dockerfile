# When building via kaniko in CI, the dependency proxy will cache image from Docker Hub.
# For local builds, Docker pulls directly from Docker Hub

# # # # # # # #
# BUILD image #
# # # # # # # #

### Build the React client
FROM node:24.20.0-alpine3.23 AS build

WORKDIR /clientsrc

# Prepare for build
RUN pwd
COPY package*.json ./

RUN npm ci
# Copy the rest of the files
COPY . /clientsrc

# Make GIT_COMMIT available inside docker/kaniko so it can be baked into the code at build time
# The GIT_COMMIT value is passed in using MAP_ENV_VARS_TO_BUILD_ARGS from the job pipeline.
# When building this container locally, this is not available so "localDev" will be used as default value
ARG GIT_COMMIT=localDev
ENV GIT_COMMIT=$GIT_COMMIT

# Build the React client
RUN npm run vite:build

# # # # # # # #
# PROD image  #
# # # # # # # #
FROM nginx:1.31.5-alpine AS prod

# Clear out the default nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy built files to nginx root
COPY --from=build /clientsrc/.local/vite/dist /usr/share/nginx/html

# Nginx config files, auth setup, and static files
COPY /docker/nginx/*.conf /etc/nginx/
COPY ./docker/nginx/*.html /usr/share/nginx/html/

# COG byte-range slice cache directory
RUN mkdir -p /var/cache/nginx/cog && chown nginx:nginx /var/cache/nginx/cog

# This image is intended to be run with docker-compose. See docker-compose*.yml files for necessary
# environment variables
CMD ["nginx", "-g", "daemon off;"]
