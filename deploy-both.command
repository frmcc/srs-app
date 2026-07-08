#!/bin/bash
# deploy-both.command — double-click to deploy BOTH updated apps to Cloud Run.
# Builds happen remotely (Cloud Build); nothing is compiled on this machine.
# Requires: gcloud installed + logged in (you have deployed with it before).

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"                 # …/srs-app
SAAS="$(cd "$DIR/../srs-saas" 2>/dev/null && pwd)"

step() { printf '\n\033[1m════ %s ════\033[0m\n' "$*"; }

command -v gcloud >/dev/null 2>&1 || { echo "gcloud is not installed (brew install google-cloud-sdk)"; read -n 1 -s; exit 1; }
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
  echo "Not logged in — run 'gcloud auth login' in Terminal first, then double-click again."
  read -n 1 -s; exit 1
fi

step "Deploying srs-app → Cloud Run (europe-west1)"
cd "$DIR"
set -a; . ./.env 2>/dev/null || true; set +a
# --update-env-vars: refreshes ONLY the database credentials from .env (so a
# token rotation lands); every other env var on the service is preserved as-is.
gcloud run deploy srs-app \
  --project auto-drive-494409 \
  --region europe-west1 \
  --source . \
  --update-env-vars="^|^DATABASE_URL=${DATABASE_URL}|TURSO_DATABASE_URL=${TURSO_DATABASE_URL}|TURSO_AUTH_TOKEN=${TURSO_AUTH_TOKEN}" \
  || { printf '\033[31msrs-app deploy failed — see output above.\033[0m\n'; read -n 1 -s; exit 1; }

if [ -n "$SAAS" ]; then
  step "Deploying srs-saas → Cloud Run (us-central1)"
  cd "$SAAS" && bash ./deploy-gcp.sh \
    || { printf '\033[31msrs-saas deploy failed — see output above.\033[0m\n'; read -n 1 -s; exit 1; }
else
  echo "srs-saas folder not found next to srs-app — deploy it manually with its deploy-gcp.sh"
fi

step "DONE"
cat <<'TXT'
Both services deployed with the values currently in each .env.
If you rotate the Turso tokens LATER, update both .env files and
double-click this again — it re-applies the DB credentials.

Live URLs:
  https://srs-app-829739548529.europe-west1.run.app
  https://srs-saas-829739548529.us-central1.run.app
TXT
printf '\nPress any key to close…'
read -n 1 -s
