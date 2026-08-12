#!/usr/bin/env bash
# Portable launcher for Linux / macOS packages
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export NODE_PATH="$ROOT/app/node_modules${NODE_PATH:+:$NODE_PATH}"
NODE="$ROOT/runtime/node"
APP="$ROOT/app/app.cjs"
if [[ ! -x "$NODE" ]]; then
  echo "[error] runtime/node not found or not executable: $NODE" >&2
  exit 1
fi
if [[ ! -f "$APP" ]]; then
  echo "[error] app/app.cjs not found: $APP" >&2
  exit 1
fi
if [[ ! -f "$ROOT/shell.json" ]]; then
  echo "[error] shell.json not found next to launcher" >&2
  exit 1
fi
exec "$NODE" "$APP"
