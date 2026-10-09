#!/bin/bash
#
# Reset the local database, by default from the latest production backup.
#
#   1. Download the newest `z:db-export:prod` artifact from GitLab into
#      $DOCKER_DB_INIT_DIR. Skipped with --no-download, or when no GitLab token
#      is available, in which case the .sql file(s) already there are used.
#   2. Drop the configured DB and recreate it empty.
#   3. Source every *.sql file in $DOCKER_DB_INIT_DIR (lexicographic order).
#   4. Run migration:up.
#
# GitLab token lookup order: $GITLAB_TOKEN, then the credential git already
# stores for the GitLab host (e.g. Git Credential Manager from an HTTPS clone).
# The token needs the read_api scope.
#
# DB connection details come from .env. When docker is available, psql runs
# inside the Dockerized postgres container. Otherwise the script looks for a
# native Postgres managed by NATIVE_DB_MANAGER, starts it if needed, and uses
# the psql binary next to it.

set -euo pipefail

GITLAB_HOST="eegitlab.fit.nasa.gov"
GITLAB_PROJECT_ID="673"
GITLAB_REF="prod"
GITLAB_JOB="z:db-export:prod"
DUMP_NAME="aegis-prod-latest.sql"

# Native (non-docker) Postgres manager, used only when docker is not installed.
# Expects psql at <manager dir>/pgsql/bin, or on PATH.
NATIVE_DB_MANAGER="$HOME/apps/dbmanager.sh"

usage() {
  echo "Usage: npm run db:init [-- --no-download]"
  echo "  --no-download  Skip fetching the prod dump; load the .sql files already in DOCKER_DB_INIT_DIR"
}

DOWNLOAD=1
for arg in "$@"; do
  case "$arg" in
    --no-download) DOWNLOAD=0 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$*" >&2; }
fail() {
  printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2
  exit 1
}
file_size() { numfmt --to=iec --suffix=B "$(wc -c <"$1")" 2>/dev/null || echo "$(wc -c <"$1") bytes"; }

if [ ! -f .env ]; then
  fail ".env not found. Run 'npm run make-dotenv' first."
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

DB="${DB_NAME:?DB_NAME not set in .env}"
INIT_DIR="${DOCKER_DB_INIT_DIR:-./.local/db-init}"
mkdir -p "${INIT_DIR}"

DB_BACKEND=""
if command -v docker >/dev/null 2>&1; then
  DB_BACKEND="docker"
  PSQL=(bash ./appcompose services exec -T database psql -U postgres)
elif [ -f "$NATIVE_DB_MANAGER" ]; then
  DB_BACKEND="native"
  LOCAL_PSQL="$(dirname "$NATIVE_DB_MANAGER")/pgsql/bin/psql.exe"
  [ -x "$LOCAL_PSQL" ] || LOCAL_PSQL="$(dirname "$NATIVE_DB_MANAGER")/pgsql/bin/psql"
  [ -x "$LOCAL_PSQL" ] || LOCAL_PSQL=$(command -v psql || true)
  [ -n "$LOCAL_PSQL" ] || fail "Found ${NATIVE_DB_MANAGER} but no psql binary next to it or on PATH."
  export PGPASSWORD="${DB_PASS:-}"
  PSQL=("$LOCAL_PSQL" -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}")
else
  fail "docker not found, and no native Postgres manager at ${NATIVE_DB_MANAGER}."
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_DIR}"' EXIT

TOKEN=""
TOKEN_SOURCE=""
find_gitlab_token() {
  if [ -n "${GITLAB_TOKEN:-}" ]; then
    TOKEN="$GITLAB_TOKEN"
    TOKEN_SOURCE="GITLAB_TOKEN env var"
    return 0
  fi
  TOKEN=$(printf 'protocol=https\nhost=%s\n\n' "$GITLAB_HOST" |
    GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -c credential.interactive=never credential fill 2>/dev/null |
    sed -n 's/^password=//p') || true
  if [ -n "$TOKEN" ]; then
    TOKEN_SOURCE="git credentials for ${GITLAB_HOST}"
    return 0
  fi
  return 1
}

# Downloads the latest prod dump into $INIT_DIR. Returns non-zero, leaving any
# existing dumps untouched, if anything goes wrong.
download_prod_dump() {
  if ! find_gitlab_token; then
    warn "No GitLab token found (checked GITLAB_TOKEN and git credentials for ${GITLAB_HOST})."
    return 1
  fi
  info "Using GitLab token from ${TOKEN_SOURCE}."

  local url="https://${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/jobs/artifacts/${GITLAB_REF}/download?job=${GITLAB_JOB}"
  local zip="${TMP_DIR}/aegis.sql.zip"
  local header_file="${TMP_DIR}/auth-header"
  local http_code

  # Pass the token via a file so it never appears in the process list.
  (umask 077 && printf 'PRIVATE-TOKEN: %s\n' "$TOKEN" >"$header_file")

  info "Fetching latest '${GITLAB_JOB}' artifact (ref: ${GITLAB_REF})..."
  http_code=$(curl -L --progress-bar -H "@${header_file}" -o "$zip" -w '%{http_code}' "$url") || http_code="000"
  rm -f "$header_file"
  if [ "$http_code" != "200" ]; then
    case "$http_code" in
      401 | 403) warn "GitLab rejected the token (HTTP ${http_code}). It needs the read_api scope." ;;
      404) warn "No '${GITLAB_JOB}' artifact found on ref '${GITLAB_REF}' (HTTP 404)." ;;
      000) warn "Could not reach ${GITLAB_HOST} (VPN?)." ;;
      *) warn "Download failed (HTTP ${http_code})." ;;
    esac
    return 1
  fi
  info "Downloaded artifact ($(file_size "$zip"))."

  info "Extracting aegis.sql and stripping PostGIS content..."
  local sql_tmp="${TMP_DIR}/${DUMP_NAME}"
  # IMPORTANT: Keep the PostGIS pattern synchronized with .gitlab/scripts/load-sql-dump.mjs,
  # scripts/upgrade-db.sh, .gitlab/includes/db-import.yml, and .gitlab/includes/server-jobs.yml
  if ! unzip -p "$zip" aegis.sql |
    sed -E '/^CREATE EXTENSION.*(postgis|tiger|topology|fuzzystrmatch).*;$/d; /^COMMENT ON EXTENSION (postgis|tiger|topology|fuzzystrmatch).*;$/d; /^CREATE SCHEMA (tiger|tiger_data|topology);$/d; /^ALTER SCHEMA (tiger|tiger_data|topology) OWNER TO .*;$/d; /^COMMENT ON SCHEMA (tiger|tiger_data|topology) .*;$/d; /^COPY (public\.spatial_ref_sys|tiger\.[a-z_]+|topology\.[a-z_]+) .* FROM stdin;$/,/^\\.$/d' \
      >"$sql_tmp"; then
    warn "Could not extract aegis.sql from the artifact."
    return 1
  fi
  if ! head -c 4096 "$sql_tmp" | grep -q 'PostgreSQL database dump'; then
    warn "Extracted file does not look like a pg_dump file."
    return 1
  fi

  # Only the new dump should be loaded. Move any others into previous/, which
  # neither this script nor Postgres' initdb reads.
  shopt -s nullglob
  local existing=("${INIT_DIR}"/*.sql)
  shopt -u nullglob
  if [ ${#existing[@]} -gt 0 ]; then
    mkdir -p "${INIT_DIR}/previous"
    local f
    for f in "${existing[@]}"; do
      info "Moving old $(basename "$f") to ${INIT_DIR}/previous/"
      mv -f "$f" "${INIT_DIR}/previous/"
    done
  fi

  mv "$sql_tmp" "${INIT_DIR}/${DUMP_NAME}"
  info "Saved ${INIT_DIR}/${DUMP_NAME} ($(file_size "${INIT_DIR}/${DUMP_NAME}"))."
}

if [ "$DOWNLOAD" -eq 1 ]; then
  step "Downloading latest prod database dump"
  if ! download_prod_dump; then
    warn "Skipping download; using whatever .sql files are already in ${INIT_DIR}."
  fi
else
  step "Skipping prod dump download (--no-download)"
fi

shopt -s nullglob
files=("${INIT_DIR}"/*.sql)
shopt -u nullglob
sorted=()
if [ ${#files[@]} -gt 0 ]; then
  mapfile -t sorted < <(printf '%s\n' "${files[@]}" | sort)
fi

step "SQL files to load from ${INIT_DIR}"
if [ ${#sorted[@]} -eq 0 ]; then
  warn "None found. The database will be created EMPTY (schema from migrations only)."
else
  for f in "${sorted[@]}"; do
    info "$(basename "$f")  ($(file_size "$f"), modified $(date -r "$f" '+%Y-%m-%d %H:%M'))"
  done
fi

db_reachable() { "${PSQL[@]}" -d postgres -tAc "SELECT 1" >/dev/null 2>&1; }

if [ "$DB_BACKEND" = "docker" ]; then
  step "Checking database container (docker)"
  db_reachable || fail "Cannot reach the 'database' container. Start it with 'npm run docker:services'."
else
  step "Checking native Postgres (docker not found; using ${NATIVE_DB_MANAGER})"
  info "psql: ${LOCAL_PSQL}"
  info "Server: ${DB_HOST:-localhost}:${DB_PORT:-5432}"
  if ! db_reachable; then
    info "Not running; starting it with: bash ${NATIVE_DB_MANAGER} ${DB} start"
    bash "$NATIVE_DB_MANAGER" "$DB" start </dev/null
    db_reachable || fail "Postgres still unreachable after running ${NATIVE_DB_MANAGER}."
  fi
fi
info "Postgres is up."

step "Terminating other connections to '${DB}'"
"${PSQL[@]}" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB}' AND pid <> pg_backend_pid();" \
  >/dev/null

step "Dropping database '${DB}'"
"${PSQL[@]}" -q -d postgres -c "DROP DATABASE IF EXISTS \"${DB}\";"

step "Creating empty database '${DB}'"
"${PSQL[@]}" -q -d postgres -c "CREATE DATABASE \"${DB}\";"

for f in "${sorted[@]}"; do
  step "Loading $(basename "$f")"
  start=$SECONDS
  "${PSQL[@]}" -q -v ON_ERROR_STOP=1 -d "${DB}" <"$f" >/dev/null
  info "Loaded in $((SECONDS - start))s."
done

step "Running migration:up"
npm run migration:up

step "Done. Database '${DB}' has been reset."
