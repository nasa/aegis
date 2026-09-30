#!/usr/bin/env bash
set -e
trap '' INT TERM

# Determine script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/../.." &> /dev/null && pwd )"

# Load environment variables from .env file
ENV_FILE="$ROOT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    echo "Loading environment variables from $ENV_FILE"
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Set default values if not defined in .env
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-aegis}"
DB_HOST="${DB_HOST:-localhost}"
DB_PASS="${DB_PASS:-postgres}"
echo "Using database port: $DB_PORT"
echo "Using database name: $DB_NAME"

# Define relative paths for data directory, log file, and SQL file
DATA_DIR="$ROOT_DIR/.local/database"
LOG_FILE="$ROOT_DIR/.local/pg.log"
SQL_FILE="$ROOT_DIR/.local/db-init/aegis.sql"
PG_USER="postgres"
PG_VERSION_FILE="$DATA_DIR/PG_VERSION"

# Function to start PostgreSQL server
start_postgres() {
    echo "Starting PostgreSQL server on port $DB_PORT..."
    nohup pg_ctl -D "$DATA_DIR" -l "$LOG_FILE" -o "-p $DB_PORT" start >/dev/null 2>&1 &
    sleep 5
}

# Check if data directory is initialized
if [ ! -f "$PG_VERSION_FILE" ]; then
    echo "PostgreSQL not initialized at $DATA_DIR. Initializing..."

    # Create a temporary password file
    TEMP_PASS_FILE=$(mktemp)
    echo "$DB_PASS" > "$TEMP_PASS_FILE"
    
    # Step 1: Initialize with password authentication
    initdb -D "$DATA_DIR" -U "$PG_USER" -E UTF8 -A scram-sha-256 --pwfile="$TEMP_PASS_FILE"
    
    # Remove temporary password file
    rm -f "$TEMP_PASS_FILE"

    # Step 2: Start server
    start_postgres

    # Export PGPASSWORD to avoid password prompts for all PostgreSQL commands
    export PGPASSWORD="$DB_PASS"
    
    # Step 3: Create database
    echo "Creating database '$DB_NAME'..."
    createdb -U "$PG_USER" -p "$DB_PORT" "$DB_NAME"
    
    # Step 4: Import SQL
    echo "Importing SQL from $SQL_FILE..."
    psql -U "$PG_USER" -p "$DB_PORT" -d "$DB_NAME" -f "$SQL_FILE"
    
    # Unset password when done
    unset PGPASSWORD

    echo -e "\n✅ Initialization complete."
else
    echo "PostgreSQL already initialized at $DATA_DIR."
    start_postgres
    
    # Set PGPASSWORD for any potential commands after startup
    export PGPASSWORD="$DB_PASS"
    echo -e "\n✅ Server started on port $DB_PORT."
fi