#!/bin/sh
# Container entrypoint: apply database migrations, seed demo data in the background, start the API.
set -e

npx prisma migrate deploy

if [ "${SEED_DEMO:-true}" = "true" ]; then
  # Background: seeding waits for the AI service, the API should not.
  node dist/scripts/seed.js &
fi

exec node dist/index.js
