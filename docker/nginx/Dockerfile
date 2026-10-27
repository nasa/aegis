# When building via Buildah in CI, the dependency proxy caches images from Docker Hub.
# For local builds, Docker pulls directly from Docker Hub

# # # # # # # #
# BUILD image #
# # # # # # # #

### Build the React client
FROM node:24.22.1-alpine AS build

WORKDIR /clientsrc

# Prepare for build
RUN pwd
COPY package*.json ./
COPY emss-fallback/check-installed.mjs ./emss-fallback/

RUN npm ci
# Copy the rest of the files
COPY . /clientsrc

# Make GIT_COMMIT available in the image so it can be baked into the code at build time
# The GIT_COMMIT value is passed as a build argument from the job pipeline.
# When building this container locally, this is not available so "localDev" will be used as default value
ARG GIT_COMMIT=localDev
ENV GIT_COMMIT=$GIT_COMMIT
ARG VITE_PUBLIC_CONSOLE_LOG_LEVEL
ENV VITE_PUBLIC_CONSOLE_LOG_LEVEL=$VITE_PUBLIC_CONSOLE_LOG_LEVEL
ARG VITE_PUBLIC_REMOTE_LOG_LEVEL
ENV VITE_PUBLIC_REMOTE_LOG_LEVEL=$VITE_PUBLIC_REMOTE_LOG_LEVEL

# Build the React client
RUN npm run vite:build

# # # # # # # #
# PROD image  #
# # # # # # # #
FROM nginx:1.29.0-alpine AS prod

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
