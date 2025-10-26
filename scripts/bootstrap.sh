#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)

cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env" 2>/dev/null || true

docker compose pull
