#!/bin/sh
#
# Creates .env file from .env.template and .env.secret

set -eu

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

RELATIVE_DOTENV_SECRET=".env.secret"
DOTENV_SECRET="${SCRIPT_DIR}/../${RELATIVE_DOTENV_SECRET}";
# Get values from .env.secret (if exists)
if [ -f "${DOTENV_SECRET}" ]; then
    source "${DOTENV_SECRET}"
fi

# Generate passwords if there wern't any sourced from the .env.secret
if [ -z "${ADMIN_RECOVERY_KEY+set}" ]; then
    export ADMIN_RECOVERY_KEY=$(tr -c -d '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' </dev/urandom | dd bs=32 count=1 2>/dev/null;echo)
fi
if [ -z "${AEGIS_DB_PASS+set}" ]; then
    export AEGIS_DB_PASS=$(tr -c -d '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' </dev/urandom | dd bs=32 count=1 2>/dev/null;echo)
fi

# Write back to .env.secret with all our passwords
echo "export AEGIS_DB_PASS=${AEGIS_DB_PASS@Q}
export ADMIN_RECOVERY_KEY=${ADMIN_RECOVERY_KEY@Q}" > "${DOTENV_SECRET}"
echo "${RELATIVE_DOTENV_SECRET} saved"

# Set all the other variables for the .env file
if [ -z "${CI+set}" ]; then # if not in CI (aka local)
    export DOCKER_SSL_CERTS_DIR=./.local/certs
    export DOCKER_SSL_PRIVATE_DIR=./.local/private

    export PUBLIC_STATIC_DIR=./public/static
    export DOCKER_DB_DATA_DIR=./.local/database
    export DOCKER_DB_INIT_DIR=./.local/db-init

    export GDAL_HOST=localhost
    export GDAL_PORT=4200

    export NEXT_PUBLIC_IN_CI_ENVIRONMENT=false

    export DOCKER_IMAGE_NGINX=eegitlabregistry.fit.nasa.gov/emss/aegis:nginx-dev
    export DOCKER_IMAGE_NEXTJS=eegitlabregistry.fit.nasa.gov/emss/aegis:nextjs-dev
    export DOCKER_IMAGE_GDAL=eegitlabregistry.fit.nasa.gov/emss/aegis:gdal-dev
else
    export DOCKER_SSL_CERTS_DIR=/etc/pki/tls/certs
    export DOCKER_SSL_PRIVATE_DIR=/etc/pki/tls/private

    export PUBLIC_STATIC_DIR=/d1/static
    export DOCKER_DB_DATA_DIR=/d1/postgres
    export DOCKER_DB_INIT_DIR=/d1/db-init

    export GDAL_HOST=gdal
    export GDAL_PORT=80

    export NEXT_PUBLIC_IN_CI_ENVIRONMENT=true

    # IMAGE_VERSION is from the pipeline job
    export DOCKER_IMAGE_NGINX="eegitlabregistry.fit.nasa.gov/emss/aegis/nginx:${IMAGE_VERSION}";
    export DOCKER_IMAGE_NEXTJS="eegitlabregistry.fit.nasa.gov/emss/aegis/nextjs:${IMAGE_VERSION}";
    export DOCKER_IMAGE_GDAL="eegitlabregistry.fit.nasa.gov/emss/aegis/gdal:${IMAGE_VERSION}";
fi

# Fill in all the variables into the .env file
# envsubst must be installed. Installed by default in Git Bash for Windows.
# Do `apk add --update --no-cache gettext` on Alpine.
cat "${SCRIPT_DIR}/../.env.template" | envsubst > "${SCRIPT_DIR}/../.env"

echo ".env successfully created"
