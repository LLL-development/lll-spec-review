#!/usr/bin/env bash
# ============================================
# 朱入れ (Shuire) — build script
# Usage:  bash ./build.sh
# Output: ./dist
#
# On Cloudflare Pages, set the build command to:  bash ./build.sh
# and the output directory to:  dist
#
# If SUPABASE_URL / SUPABASE_ANON_KEY environment variables are set
# (Pages → Settings → Environment variables), they are injected into
# js/config.js at build time — so you never commit real keys.
# ============================================
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SRC_DIR/dist"

echo "→ Cleaning dist/"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "→ Copying static files"
cp "$SRC_DIR"/*.html "$DIST_DIR/"
mkdir -p "$DIST_DIR/js" "$DIST_DIR/css"
cp "$SRC_DIR"/js/*.js "$DIST_DIR/js/"
cp "$SRC_DIR"/css/*.css "$DIST_DIR/css/"

# Optional extras (headers, redirects) if present
[ -f "$SRC_DIR/_headers" ]   && cp "$SRC_DIR/_headers"   "$DIST_DIR/"
[ -f "$SRC_DIR/_redirects" ] && cp "$SRC_DIR/_redirects" "$DIST_DIR/"

# ---- Inject Supabase config from environment (if provided) ----
CONFIG="$DIST_DIR/js/config.js"

if [ -n "${SUPABASE_URL:-}" ]; then
  echo "→ Injecting SUPABASE_URL from environment"
  sed -i.bak "s|https://YOUR-PROJECT-REF.supabase.co|${SUPABASE_URL}|g" "$CONFIG"
fi

if [ -n "${SUPABASE_ANON_KEY:-}" ]; then
  echo "→ Injecting SUPABASE_ANON_KEY from environment"
  sed -i.bak "s|YOUR-ANON-PUBLIC-KEY|${SUPABASE_ANON_KEY}|g" "$CONFIG"
fi

rm -f "$CONFIG.bak"

# ---- Sanity check: fail the build if config is still placeholder ----
if grep -q "YOUR-PROJECT-REF" "$CONFIG"; then
  echo ""
  echo "⚠  WARNING: js/config.js still contains placeholder values."
  echo "   Either edit js/config.js directly, or set SUPABASE_URL and"
  echo "   SUPABASE_ANON_KEY as environment variables before building."
  echo ""
  # Uncomment the next line to make this a hard failure on CI:
  # exit 1
fi

echo "✓ Build complete → $DIST_DIR"
