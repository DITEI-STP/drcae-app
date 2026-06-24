#!/bin/bash
set -euo pipefail

cd /opt/app

CHECKSUM_DIR="/opt/app/.dev-cache/checksum"
mkdir -p "$CHECKSUM_DIR"

needs_install=false
if [ -d /opt/app/node_modules/.pnpm ]; then
  echo "[app] node_modules em layout pnpm detectado — limpando para npm..."
  rm -rf /opt/app/node_modules/*
  needs_install=true
fi

LOCK_HASH=$(cat package.json package-lock.json 2>/dev/null | md5sum | cut -d' ' -f1)
STORED_LOCK=$(cat "$CHECKSUM_DIR/npm" 2>/dev/null || echo "")

if [ "$LOCK_HASH" != "$STORED_LOCK" ]; then
  needs_install=true
elif [ ! -x /opt/app/node_modules/.bin/vite ]; then
  needs_install=true
elif [ ! -d /opt/app/node_modules/centrifuge ] && grep -q '"centrifuge"' package.json; then
  needs_install=true
fi

if [ "$needs_install" = true ]; then
  echo "[app] Dependências alteradas ou incompletas — executando npm install..."
  npm install --prefer-offline --no-audit --no-fund
  npm rebuild esbuild || true
  echo "$LOCK_HASH" > "$CHECKSUM_DIR/npm"
else
  echo "[app] node_modules actualizado — pulando instalação."
fi

if [ "${1:-}" = "install" ] || [ "${1:-}" = "install-only" ]; then
  exit 0
fi

exec npm run dev
