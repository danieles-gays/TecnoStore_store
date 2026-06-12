#!/usr/bin/env bash
set -euo pipefail

rm -f ci-test.sqlite

cat > .env <<ENV
PORT=3001
JWT_SECRET=ci_jwt_secret_only_for_tests
DB_PATH=./ci-test.sqlite
ENV

npm run seed

npm start > /tmp/tecnostore-store-ci.log 2>&1 &
APP_PID=$!

cleanup() {
  kill "$APP_PID" 2>/dev/null || true
  rm -f .env ci-test.sqlite
}
trap cleanup EXIT

sleep 5

curl -fsS http://127.0.0.1:3001/ | grep -i "TecnoStore"

echo "Test de integración HTTP OK"
