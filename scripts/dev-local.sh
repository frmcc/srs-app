#!/usr/bin/env bash
# Local-only dev server on port 3003, fully isolated from production:
# Turso vars are stripped so src/lib/db.ts falls back to the local sqlite file,
# and NEXTAUTH_SECRET is a fixed local-only value so scripts/seed-dev-local.mjs
# can mint a session cookie (page.tsx requires a session even in dev). Used for
# UI verification with seeded data — never against live user data.
set -euo pipefail
cd "$(dirname "$0")/.."
# Empty strings, not `unset`: next dev re-loads .env and would restore any
# ABSENT var, but it never overrides one that exists — and src/lib/db.ts
# treats "" as unset (falsy), so this reliably forces the local sqlite path.
export TURSO_DATABASE_URL=""
export TURSO_AUTH_TOKEN=""
export DATABASE_URL="file:$PWD/dev-local.db"
export NEXTAUTH_SECRET="local-verification-only-not-a-real-secret"
export NEXTAUTH_URL="http://localhost:3003"
exec npx next dev -p 3003
