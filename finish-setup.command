#!/bin/bash
# finish-setup.command — one-click finisher for srs-app + srs-saas
# Double-click this file (it opens Terminal). It only runs local, safe steps:
# dependency install + Prisma client regeneration + typecheck for both repos.
# (Databases are already reconciled; git is already synced with GitHub.)

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"          # …/srs-app
SAAS="$(cd "$DIR/../srs-saas" 2>/dev/null && pwd)"

step() { printf '\n\033[1m════ %s ════\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*"; FAILED=1; }
FAILED=0

step "srs-app: installing dependencies (aligned Prisma v6 adapters)"
cd "$DIR" && npm install --no-audit --no-fund || fail "npm install (srs-app)"

step "srs-app: regenerating Prisma client (version + comprehension columns)"
npx prisma generate || fail "prisma generate (srs-app)"

step "srs-app: typecheck (should be completely clean now)"
npx tsc --noEmit && printf '\033[32m✓ srs-app clean\033[0m\n' || fail "tsc (srs-app)"

if [ -n "$SAAS" ]; then
  step "srs-saas: installing dependencies"
  cd "$SAAS" && npm install --no-audit --no-fund || fail "npm install (srs-saas)"

  step "srs-saas: regenerating Prisma client (new version column)"
  npx prisma generate || fail "prisma generate (srs-saas)"

  step "srs-saas: typecheck (should be completely clean now)"
  npx tsc --noEmit && printf '\033[32m✓ srs-saas clean\033[0m\n' || fail "tsc (srs-saas)"
else
  fail "srs-saas folder not found next to srs-app — run the saas steps manually"
fi

step "STILL YOURS TO DO (needs your accounts — can't be automated)"
cat <<'TXT'
1) Rotate the leaked Turso tokens (they are in PUBLIC GitHub history):
     turso auth login
     turso db tokens invalidate tutorsrspersonal   # kills all old tokens (srs-app DB)
     turso db tokens invalidate tutorsrshost       # (srs-saas DB)
     turso db tokens create tutorsrspersonal       # new token for srs-app
     turso db tokens create tutorsrshost           # new token for srs-saas
   Then paste the new tokens into:
     srs-app/.env   → TURSO_AUTH_TOKEN + the authToken in DATABASE_URL
     srs-saas/.env  → TURSO_AUTH_TOKEN
   …and into your deployment env vars, then redeploy both apps
   (deployments keep running old code + old tokens until redeployed).

2) Revoke the GitHub fine-grained token you pasted into the chat
   (GitHub → Settings → Developer settings → Fine-grained tokens → Revoke).
TXT

step "RESULT"
if [ "$FAILED" -eq 0 ]; then
  printf '\033[32mAll automated steps succeeded. Apps are ready to run locally.\033[0m\n'
else
  printf '\033[31mSome steps failed — scroll up for the ✗ lines.\033[0m\n'
fi
printf '\nPress any key to close…'
read -n 1 -s
