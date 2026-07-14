#!/usr/bin/env bash
# ============================================
# 朱入れ (Shuire) — build script
# Usage:  bash ./build.sh
# Output: ./dist  (static frontend, served by the Worker's assets binding)
# ============================================
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SRC_DIR/dist"

echo "→ Cleaning dist/"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/js" "$DIST_DIR/css"

echo "→ Copying static files"
cp "$SRC_DIR"/*.html "$DIST_DIR/"
cp "$SRC_DIR"/js/*.js "$DIST_DIR/js/"
cp "$SRC_DIR"/css/*.css "$DIST_DIR/css/"

[ -f "$SRC_DIR/_headers" ] && cp "$SRC_DIR/_headers" "$DIST_DIR/"

echo "✓ Build complete → $DIST_DIR"
