#!/bin/sh
set -eu

# Persist a local preview certificate. Shared deployments mount their own certificate here.
if [ ! -s /etc/nginx/certs/tls.crt ] || [ ! -s /etc/nginx/certs/tls.key ]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
        -subj "/CN=${PUBLIC_HOST}" -addext "subjectAltName=DNS:${PUBLIC_HOST}" \
        -keyout /etc/nginx/certs/tls.key -out /etc/nginx/certs/tls.crt
    chmod 600 /etc/nginx/certs/tls.key
fi
