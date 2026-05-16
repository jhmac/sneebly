#!/bin/bash
set -e

echo "[post-merge] Installing npm dependencies..."
npm install --legacy-peer-deps

echo "[post-merge] Running database migrations..."
npx drizzle-kit push 2>/dev/null || echo "[post-merge] DB push skipped or failed (non-fatal)"

echo "[post-merge] Done."
