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
