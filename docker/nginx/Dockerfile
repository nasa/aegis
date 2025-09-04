# Get the base image, which is supplied by the pipeline. If the *_BASE_IMAGE value is not defined
#   (which is true when building locally) then use the value to the right of the = operator
ARG NGINX_BASE_IMAGE=nginx:1.29.0-alpine
ARG NODE_BASE_IMAGE=node:22.18.0-alpine

# # # # # # # # #
# BUILDER image #
# # # # # # # # #

### Build the React client
FROM $NODE_BASE_IMAGE AS builder

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
FROM $NGINX_BASE_IMAGE AS prod

# Clear out the default nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy built files to nginx root
COPY --from=builder /clientsrc/.local/vite/dist /usr/share/nginx/html

# Nginx config files, auth setup, and static files
COPY /docker/nginx/*.conf /etc/nginx/
COPY ./docker/nginx/*.html /usr/share/nginx/html/

# This image is intended to be run with docker-compose. See docker-compose*.yml files for necessary
# environment variables
CMD ["nginx", "-g", "daemon off;"]
