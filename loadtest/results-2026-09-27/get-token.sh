#!/usr/bin/env bash
# Grab a fresh access-token for the target persona from the running local API.
# Prints the token (copy into Burp Cookie header).
# Usage: ./get-token.sh [player|hr|coach|finance|asset|gm|meddir]
set -euo pipefail

PERSONA="${1:-player}"
case "$PERSONA" in
  player)  EMAIL="player@club.com" ;;
  hr)      EMAIL="hr@club.com" ;;
  coach)   EMAIL="coach@club.com" ;;
  finance) EMAIL="finance@club.com" ;;
  asset)   EMAIL="asset@club.com" ;;
  gm)      EMAIL="gm@club.com" ;;
  meddir)  EMAIL="meddir@club.com" ;;
  *) echo "unknown persona: $PERSONA" >&2; exit 1 ;;
esac

BASE_URL="${BASE_URL:-http://localhost:3001/api}"
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Password1!\"}" \
  -c "$JAR")

if [ "$STATUS" != "200" ]; then
  echo "login failed ($STATUS) for $EMAIL" >&2
  exit 2
fi

grep access-token "$JAR" | awk '{print $NF}'
