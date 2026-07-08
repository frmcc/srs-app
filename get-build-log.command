#!/bin/bash
# get-build-log.command — double-click to fetch the REAL Cloud Build error logs
# for BOTH services (srs-app in europe-west1, srs-saas in us-central1).
# Saves each log next to this file as build-log-<region>-<id>.txt so it can be shared.
set -u
cd "$(cd "$(dirname "$0")" && pwd)"
PROJECT=auto-drive-494409
REGIONS=(europe-west1 us-central1)

command -v gcloud >/dev/null 2>&1 || { echo "gcloud not installed."; read -n1 -s; exit 1; }

for REGION in "${REGIONS[@]}"; do
  echo "════════════════════════════════════════════════════════"
  echo "  REGION: $REGION"
  echo "════════════════════════════════════════════════════════"
  echo "Recent builds:"
  gcloud builds list --region="$REGION" --project="$PROJECT" --limit=5 \
    --format="table(id, status, createTime.date('%Y-%m-%d %H:%M'), duration)" || {
      echo; echo "Could not list builds in $REGION — likely a gcloud auth problem."
      echo "Run this in Terminal first:  gcloud auth login"
      continue; }

  LATEST=$(gcloud builds list --region="$REGION" --project="$PROJECT" --limit=1 --format="value(id)")
  if [ -z "$LATEST" ]; then echo "No builds found in $REGION."; echo; continue; fi

  OUT="build-log-$REGION-$LATEST.txt"
  echo
  echo "──── Full log of the most recent $REGION build ────"
  gcloud builds log "$LATEST" --region="$REGION" --project="$PROJECT" | tee "$OUT"
  echo
  echo "Saved to: $OUT"
  echo
done

echo "════ DONE ════"
echo "The real error is usually in the last ~30 lines of each log above."
printf '\nPress any key to close…'
read -n1 -s
