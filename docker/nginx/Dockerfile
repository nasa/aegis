# Get the base image, which is supplied by the pipeline. If the *_BASE_IMAGE value is not defined
#   (which is true when building locally) then use the value to the right of the = operator
ARG NGINX_BASE_IMAGE=nginx:1.23.0-alpine
ARG NODE_BASE_IMAGE=node:20.11.0-alpine

# # # # # # # #
# BASE image  #
# # # # # # # #

# This build doesn't actually need the "AS base" except that it simplifies our .gitlab-ci.yml by
# allowing us to specify `--target base`
FROM $NGINX_BASE_IMAGE AS base


# # # # # # # # #
# BUILDER image #
# # # # # # # # #

### Build the React client
FROM $NODE_BASE_IMAGE AS builder

RUN mkdir /clientsrc
WORKDIR /clientsrc

# Prepare for build
RUN pwd
COPY package*.json ./

RUN npm ci
# copy the rest of the files
COPY . /clientsrc

# Build the React client
RUN npm run vite:build

# # # # # # # #
# PROD image  #
# # # # # # # #

# This build doesn't actually need the "AS base" except that it simplifies our .gitlab-ci.yml by
# allowing us to specify `--target base`
FROM base AS prod

# Clear out the default nginx files
RUN rm -rf /usr/share/nginx/html/*

# Copy built files to nginx root
COPY --from=builder /clientsrc/.local/vite/dist /usr/share/nginx/html

# Nginx config files and auth setup
COPY /docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY /docker/nginx/setup-auth.conf /etc/nginx/setup-auth.conf
COPY /docker/nginx/route-require-auth.conf /etc/nginx/route-require-auth.conf
COPY /docker/nginx/loggedout.html /usr/share/nginx/html/
COPY /docker/nginx/loggedin.html /usr/share/nginx/html/

# This image is intended to be run with docker-compose. See docker-compose*.yml files for necessary
# environment variables
CMD ["nginx", "-g", "daemon off;"]
