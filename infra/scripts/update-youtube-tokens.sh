#!/usr/bin/env bash
# ==============================================================================
# Runtime YouTube Token Update Script
# ==============================================================================
# Purpose:
# Updates poToken, visitorData, and OAuth refreshToken on a running Lavalink
# node WITHOUT restarting the container or interrupting active voice players.
#
# Verified REST endpoint from youtube-source plugin documentation:
#   POST /youtube
#   Headers:
#     Authorization: <Lavalink password>
#     Content-Type: application/json
#   Body:
#     {
#       "refreshToken": "...",
#       "skipInitialization": true,
#       "poToken": "...",
#       "visitorData": "..."
#     }
#
# Usage:
#   ./update-youtube-tokens.sh [LAVALINK_URL] [PASSWORD] [PO_TOKEN] [VISITOR_DATA] [REFRESH_TOKEN]
#
# Or set environment variables:
#   LAVALINK_URL=http://127.0.0.1:2333 \
#   LAVALINK_PASSWORD=youshallnotpass \
#   PO_TOKEN=... \
#   VISITOR_DATA=... \
#   REFRESH_TOKEN=... \
#   ./update-youtube-tokens.sh
# ==============================================================================

set -euo pipefail

LAVALINK_URL="${1:-${LAVALINK_URL:-http://127.0.0.1:2333}}"
LAVALINK_PASSWORD="${2:-${LAVALINK_PASSWORD:-${LAVALINK_SERVER_PASSWORD:-youshallnotpass}}}"
PO_TOKEN="${3:-${PO_TOKEN:-${YOUTUBE_PO_TOKEN:-}}}"
VISITOR_DATA="${4:-${VISITOR_DATA:-${YOUTUBE_VISITOR_DATA:-}}}"
REFRESH_TOKEN="${5:-${REFRESH_TOKEN:-${YOUTUBE_OAUTH_REFRESH_TOKEN:-}}}"

echo "Connecting to Lavalink at: $LAVALINK_URL"

# Construct dynamic JSON payload omitting null/empty fields
PAYLOAD="{"
FIRST=true

if [ -n "$REFRESH_TOKEN" ]; then
  PAYLOAD="${PAYLOAD}\"refreshToken\":\"$REFRESH_TOKEN\",\"skipInitialization\":true"
  FIRST=false
fi

if [ -n "$PO_TOKEN" ]; then
  if [ "$FIRST" = false ]; then PAYLOAD="${PAYLOAD},"; fi
  PAYLOAD="${PAYLOAD}\"poToken\":\"$PO_TOKEN\""
  FIRST=false
fi

if [ -n "$VISITOR_DATA" ]; then
  if [ "$FIRST" = false ]; then PAYLOAD="${PAYLOAD},"; fi
  PAYLOAD="${PAYLOAD}\"visitorData\":\"$VISITOR_DATA\""
  FIRST=false
fi

PAYLOAD="${PAYLOAD}}"

if [ "$PAYLOAD" = "{}" ]; then
  echo "Error: No tokens provided to update."
  echo "Usage: $0 [LAVALINK_URL] [PASSWORD] [PO_TOKEN] [VISITOR_DATA] [REFRESH_TOKEN]"
  exit 1
fi

echo "Sending updated credentials to POST /youtube..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$LAVALINK_URL/youtube" \
  -H "Authorization: $LAVALINK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [ "$HTTP_STATUS" = "204" ] || [ "$HTTP_STATUS" = "200" ]; then
  echo "✓ Successfully updated YouTube tokens (HTTP $HTTP_STATUS)!"
  echo ""
  echo "Current status check from GET /youtube:"
  curl -s -X GET "$LAVALINK_URL/youtube" -H "Authorization: $LAVALINK_PASSWORD" || true
  echo ""
else
  echo "✗ Failed to update tokens. Received HTTP $HTTP_STATUS."
  echo "Verify that the Lavalink node is running, the password is correct, and youtube-source is loaded."
  exit 1
fi

