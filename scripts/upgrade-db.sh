#!/bin/bash
set -e

# This script upgrades the database when a major Postgres version change is detected.
# It is run on the deployment host by CI/CD before deploying the new container version.

# Load environment variables
if [ -f .env ]; then
  source .env
fi

# Configuration
DOCKER_DB_DATA_DIR=${DOCKER_DB_DATA_DIR:-/d1/aegis/postgres}
DOCKER_DB_INIT_DIR=${DOCKER_DB_INIT_DIR:-/d1/aegis/db-init}
LOG_DATA_APP_ID=${LOG_DATA_APP_ID:-aegis}
CONTAINER_NAME="${LOG_DATA_APP_ID}--database"
DB_NAME=${DB_NAME:-aegis}

echo "Starting database upgrade check for container: $CONTAINER_NAME"

# 1. Determine Target Version from docker-compose.yml
if [ ! -f docker-compose.yml ]; then
  echo "Error: docker-compose.yml not found. Cannot determine target version."
  exit 1
fi

# Extract the image line for the 'database' service.
# We look for '  database:' (exactly 2-space indented, as a top-level service) and then the first 'image:' line inside it.
# The pattern ensures we match the database SERVICE, not 'database:' appearing in depends_on blocks.
TARGET_IMAGE_LINE=$(awk '/^  database:$/{flag=1} flag && /^    image:/{print $0; exit}' docker-compose.yml)
# Clean up to get just the image name (remove 'image:', quotes, spaces)
TARGET_IMAGE_RAW=$(echo "$TARGET_IMAGE_LINE" | sed 's/image://;s/"//g;s/ //g')
# Expand environment variables in the image string (DOCKER_IMAGE_DATABASE is already set from .env above)
TARGET_IMAGE=$(echo "$TARGET_IMAGE_RAW" | envsubst)

echo "Target image found in docker-compose.yml: $TARGET_IMAGE"

# Extract major version (digits after the first colon)
TARGET_MAJOR_VERSION=$(echo "$TARGET_IMAGE" | sed -E 's/.*:([0-9]+).*/\1/')

if ! [[ "$TARGET_MAJOR_VERSION" =~ ^[0-9]+$ ]]; then
  echo "Error: Could not extract integer major version from image string '$TARGET_IMAGE'. Skipping upgrade check."
  exit 0
fi

echo "Target Postgres Major Version: $TARGET_MAJOR_VERSION"

# 2. Get Running Version
if ! docker ps --filter "name=^/${CONTAINER_NAME}$" --format '{{.Names}}' | grep -q .; then
  echo "Container $CONTAINER_NAME is not running. Skipping upgrade."
  exit 0
fi

RUNNING_VERSION_FULL=$(docker exec "$CONTAINER_NAME" psql -U postgres -t -c "SHOW server_version;" | tr -d ' \r\n')
RUNNING_MAJOR_VERSION=$(echo "$RUNNING_VERSION_FULL" | cut -d. -f1)

if [ -z "$RUNNING_MAJOR_VERSION" ]; then
  echo "Error: Could not read running Postgres version from $CONTAINER_NAME (container may still be starting). Aborting."
  exit 1
fi

echo "Running Postgres Version (from container): $RUNNING_VERSION_FULL (Major: $RUNNING_MAJOR_VERSION)"

# 3. Compare and Migrate
if [ "$RUNNING_MAJOR_VERSION" -lt "$TARGET_MAJOR_VERSION" ]; then
  echo "Detected upgrade needed from $RUNNING_MAJOR_VERSION to $TARGET_MAJOR_VERSION..."

  echo "1. Dumping database..."
  # Exclude PostGIS schemas/tables — AEGIS doesn't use PostGIS DB features, and plain postgres:17
  # can't create the postgis extension. A dump with PostGIS content would fail to import on first boot.
  if ! docker exec "$CONTAINER_NAME" pg_dump -U postgres -d "$DB_NAME" --clean --if-exists \
      --exclude-schema=tiger \
      --exclude-schema=tiger_data \
      --exclude-schema=topology \
      --exclude-table=public.spatial_ref_sys \
      > dump.sql; then
    echo "CRITICAL ERROR: Database dump failed. Aborting upgrade to prevent data loss."
    rm -f dump.sql
    exit 1
  fi

  # Verify the dump file is not empty
  if [ ! -s dump.sql ]; then
    echo "CRITICAL ERROR: Database dump file is empty. Aborting upgrade to prevent data loss."
    rm -f dump.sql
    exit 1
  fi

  DUMP_SIZE=$(wc -c < dump.sql)
  echo "   Dump completed successfully. Size: $DUMP_SIZE bytes"

  echo "1b. Stripping PostGIS content from dump..."
  # pg_dump always emits CREATE EXTENSION DDL regardless of --exclude-schema/--exclude-table,
  # and historical dumps taken before the export job added --exclude-schema/--exclude-table
  # flags may still contain PostGIS schema DDL and COPY data blocks. Plain postgres:17 doesn't
  # have these extensions, so any surviving PostGIS statements must be removed before postgres
  # tries to import the file on first boot via /docker-entrypoint-initdb.d/ (psql aborts on the
  # first error and silently drops all subsequent statements, leaving the DB in a broken state).
  # IMPORTANT: Keep the PostGIS pattern synchronized with .gitlab/scripts/load-sql-dump.mjs,
  # .gitlab/includes/db-import.yml, and .gitlab/includes/server-jobs.yml
  sed -E \
    '/^CREATE EXTENSION.*(postgis|tiger|topology|fuzzystrmatch).*;$/d;
     /^COMMENT ON EXTENSION (postgis|tiger|topology|fuzzystrmatch).*;$/d;
     /^CREATE SCHEMA (tiger|tiger_data|topology);$/d;
     /^ALTER SCHEMA (tiger|tiger_data|topology) OWNER TO .*;$/d;
     /^COMMENT ON SCHEMA (tiger|tiger_data|topology) .*;$/d;
     /^COPY (public\.spatial_ref_sys|tiger\.[a-z_]+|topology\.[a-z_]+) .* FROM stdin;$/,/^\\\.$/d' \
    dump.sql > dump_clean.sql
  mv dump_clean.sql dump.sql
  echo "   Strip complete. New size: $(wc -c < dump.sql) bytes"

  echo "2. Preparing init directory..."
  # Clear and recreate init directory to ensure clean state.
  # Restore gitlab-runner ownership so subsequent CI jobs can write to it without sudo.
  echo "$DEPLOY_SUDO_PASS" | sudo -S rm -rf "$DOCKER_DB_INIT_DIR"
  echo "$DEPLOY_SUDO_PASS" | sudo -S mkdir -p "$DOCKER_DB_INIT_DIR"
  echo "$DEPLOY_SUDO_PASS" | sudo -S chown gitlab-runner:gitlab-runner "$DOCKER_DB_INIT_DIR"
  # Move dump to init directory so the new container imports it on first boot
  # PostgreSQL entrypoint runs .sql files against $POSTGRES_DB (set in docker-compose.yml)
  echo "$DEPLOY_SUDO_PASS" | sudo -S mv dump.sql "$DOCKER_DB_INIT_DIR/restore-dump.sql"
  echo "$DEPLOY_SUDO_PASS" | sudo -S chmod 644 "$DOCKER_DB_INIT_DIR/restore-dump.sql"

  echo "3. Stopping database container..."
  docker stop "$CONTAINER_NAME"
  docker rm "$CONTAINER_NAME"

  echo "4. Removing old data directory..."
  # Remove old data so the new container starts fresh and imports the dump from step 2
  echo "$DEPLOY_SUDO_PASS" | sudo -S rm -rf "$DOCKER_DB_DATA_DIR"

  echo "Upgrade preparation complete."
  echo "The next deployment step will start the new Postgres $TARGET_MAJOR_VERSION container."
  echo "The new container will initialize with an empty data directory and import $DOCKER_DB_INIT_DIR/restore-dump.sql."

elif [ "$RUNNING_MAJOR_VERSION" -eq "$TARGET_MAJOR_VERSION" ]; then
  echo "Database is already on version $TARGET_MAJOR_VERSION. No upgrade needed."
else
  echo "Running version ($RUNNING_MAJOR_VERSION) is newer than target ($TARGET_MAJOR_VERSION). Skipping upgrade."
fi
