# When building via kaniko in CI, the dependency proxy will cache image from Docker Hub.
# For local builds, Docker pulls directly from Docker Hub

# # # # # # # #
# BUILD image #
# # # # # # # #

### Build the React client
FROM node:24.11.1-alpine3.23 AS build

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
FROM nginx:1.29.0-alpine AS prod

# Clear out the default nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy built files to nginx root
COPY --from=build /clientsrc/.local/vite/dist /usr/share/nginx/html

# Runtime base-URL substitution. The stock nginx:alpine entrypoint
# (`/docker-entrypoint.d/20-envsubst-on-templates.sh`) renders every file
# under NGINX_ENVSUBST_TEMPLATE_DIR with envsubst and writes the output to
# NGINX_ENVSUBST_OUTPUT_DIR before launching nginx. Pointing the output at
# /etc/nginx lets us replace the top-level nginx.conf. The FILTER restricts
# substitution to BASE_URL_REPLACE so unrelated env vars cannot bleed into
# the config — see imago/docs/consumer-base-url-rewrite.md §4.
ENV NGINX_ENVSUBST_TEMPLATE_DIR=/etc/nginx/templates
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx
ENV NGINX_ENVSUBST_FILTER=^BASE_URL_REPLACE$

# Nginx config files, auth setup, and static files
COPY /docker/nginx/nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY /docker/nginx/setup-auth.conf /etc/nginx/setup-auth.conf
COPY /docker/nginx/route-require-auth.conf /etc/nginx/route-require-auth.conf
COPY /docker/nginx/locations-shared.conf /etc/nginx/locations-shared.conf
COPY /docker/nginx/imago-auth-headers.conf /etc/nginx/imago-auth-headers.conf
COPY ./docker/nginx/*.html /usr/share/nginx/html/

# This image is intended to be run with docker-compose. See docker-compose*.yml files for necessary
# environment variables
CMD ["nginx", "-g", "daemon off;"]
