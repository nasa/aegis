# Must have base image, which is supplied by docker-compose, defined in .env, and
# set appropriately for the environment via scripts/make-dotenv.sh
ARG NGINX_BASE_IMAGE=nginx:1.23.0-alpine

# This build doesn't actually need the "AS base" except that it simplifies our .gitlab-ci.yml by
# allowing us to specify `--target base`
FROM $NGINX_BASE_IMAGE as base

# Ensure images directory exists.
RUN mkdir -p /usr/share/nginx/static 

# Nginx config files
COPY /docker/nginx/nginx.conf /etc/nginx/nginx.conf

# This image is intended to be run with docker-compose. See docker-compose*.yml files for necessary
# environment variables
CMD ["nginx", "-g", "daemon off;"]
