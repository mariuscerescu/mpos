#!/usr/bin/env bash
set -euo pipefail

HOST="$1"
PORT="$2"
TIMEOUT="${3:-60}"

END=$((SECONDS+TIMEOUT))
while [ $SECONDS -lt $END ]; do
  if nc -z "$HOST" "$PORT"; then
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for $HOST:$PORT"
exit 1
