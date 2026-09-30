#!/usr/bin/env bash
set -e

# Determine script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/../.." &> /dev/null && pwd )"

# Define relative paths for data directory and log file
DATA_DIR="$ROOT_DIR/.local/database"
LOG_FILE="$ROOT_DIR/.local/pg.log"

echo "Stopping PostgreSQL server at $DATA_DIR..."
pg_ctl -D "$DATA_DIR" stop -m fast

if [ $? -eq 0 ]; then
    echo "✅ Server stopped."
else
    echo "⚠️ Failed to stop server. It may not be running or pg_ctl could not connect."
fi