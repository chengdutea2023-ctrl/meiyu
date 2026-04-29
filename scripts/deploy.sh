#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/zhimei-education-platform}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$APP_DIR"

echo "Pulling latest code..."
git pull --ff-only

echo "Building and restarting services..."
docker compose -f "$COMPOSE_FILE" --env-file .env.production up -d --build

echo "Running database migrations..."
docker compose -f "$COMPOSE_FILE" --env-file .env.production exec -T api npm run db:deploy --workspace @jiaoxue/platform-api

echo "Current services:"
docker compose -f "$COMPOSE_FILE" --env-file .env.production ps

