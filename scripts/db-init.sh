#!/bin/bash
#
# Drop the configured DB, recreate it empty, source every *.sql file in
# $DOCKER_DB_INIT_DIR (lexicographic order), then run migration:up.
#
# DB connection details come from .env. psql runs inside the Dockerized
# postgres container, so no local psql binary is required.

set -euo pipefail

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run 'npx make-dotenv' first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

DB="${DB_NAME:?DB_NAME not set in .env}"
INIT_DIR="${DOCKER_DB_INIT_DIR:-./.local/db-init}"

PSQL=(bash ./appcompose services exec -T database psql -U postgres)

echo "==> Terminating other connections to '${DB}'..."
"${PSQL[@]}" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB}' AND pid <> pg_backend_pid();" \
  >/dev/null

echo "==> Dropping database '${DB}'..."
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"${DB}\";"

echo "==> Creating empty database '${DB}'..."
"${PSQL[@]}" -d postgres -c "CREATE DATABASE \"${DB}\";"

if [ ! -d "${INIT_DIR}" ]; then
  echo "==> ${INIT_DIR} does not exist; creating it. No SQL files to source."
  mkdir -p "${INIT_DIR}"
else
  shopt -s nullglob
  files=("${INIT_DIR}"/*.sql)
  shopt -u nullglob
  if [ ${#files[@]} -eq 0 ]; then
    echo "==> No .sql files in ${INIT_DIR}; nothing to source."
  else
    IFS=$'\n' read -r -d '' -a sorted < <(printf '%s\n' "${files[@]}" | sort && printf '\0')
    for f in "${sorted[@]}"; do
      echo "==> Sourcing ${f}..."
      "${PSQL[@]}" -v ON_ERROR_STOP=1 -d "${DB}" < "${f}"
    done
  fi
fi

echo "==> Running migration:up..."
npm run migration:up

echo "==> Done."
