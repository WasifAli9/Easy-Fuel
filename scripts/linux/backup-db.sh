#!/usr/bin/env bash
# Backup EasyFuel DB from Contabo Docker Postgres (run on the server or via SSH).
set -euo pipefail

OUT_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_NAME="easyfuel-${STAMP}.dump"
CONTAINER="${POSTGRES_CONTAINER:-postgres}"
DB_USER="${POSTGRES_USER:-easyfuel_app}"
DB_NAME="${POSTGRES_DB:-easyfuel}"

mkdir -p "$OUT_DIR"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f "/tmp/${DUMP_NAME}"
docker cp "${CONTAINER}:/tmp/${DUMP_NAME}" "${OUT_DIR}/${DUMP_NAME}"
docker exec "$CONTAINER" rm -f "/tmp/${DUMP_NAME}"
echo "Wrote ${OUT_DIR}/${DUMP_NAME}"
