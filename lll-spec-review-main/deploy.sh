#!/usr/bin/env bash
# ============================================================
# lll-spec-review — Termux deployer
# Usage:  ./deploy.sh 1.1.0
# Finds the downloaded lll-spec-review zip matching that version,
# stages it, syncs the local repo, commits with commit.txt and
# pushes (GitHub Actions deploys). Mirrors the archquest flow.
# ============================================================
set -euo pipefail

VER="${1:-}"
if [ -z "$VER" ]; then
  echo "Usage: ./deploy.sh <version>   e.g. ./deploy.sh 1.1.0"
  exit 1
fi

DL="$HOME/storage/downloads"
STAGE="$HOME/lx3/deployment-lllsr"
REPO="$HOME/lx3/lll-spec-review"

# ---- preflight ----
[ -d "$DL" ] || { echo "✗ $DL not found — run: termux-setup-storage"; exit 1; }
command -v unzip >/dev/null || { echo "✗ unzip missing — run: pkg install unzip"; exit 1; }
command -v git >/dev/null || { echo "✗ git missing — run: pkg install git"; exit 1; }
[ -d "$REPO/.git" ] || { echo "✗ $REPO is not a git repo"; exit 1; }

# ---- find the newest zip fuzzy-matching the version ----
ZIP=$(ls -t "$DL"/*lll-spec-review*"$VER"*.zip 2>/dev/null | head -1 || true)
if [ -z "$ZIP" ]; then
  ZIP=$(ls -t "$DL"/*lll-spec-review*.zip 2>/dev/null | head -1 || true)
  [ -n "$ZIP" ] || { echo "✗ No lll-spec-review zip found in $DL"; exit 1; }
  echo "! Nothing matches version '$VER'. Newest zip is:"
  echo "    $(basename "$ZIP")  ($(date -r "$ZIP" '+%d %b %H:%M'))"
  read -rp "  Use this one? [y/N] " a
  [ "$a" = "y" ] || [ "$a" = "Y" ] || exit 1
fi
echo "→ Zip: $(basename "$ZIP")"

# ---- clean staging, unzip ----
rm -rf "$STAGE"; mkdir -p "$STAGE"
cp "$ZIP" "$STAGE/"; cd "$STAGE"; unzip -q "$(basename "$ZIP")"
SRC="$STAGE/lll-spec-review"
[ -d "$SRC" ] || SRC="$STAGE"

ZVER=$(tr -d ' \n' < "$SRC/VERSION" 2>/dev/null || echo "?")
echo "→ Zip VERSION file says: $ZVER"
[ "$ZVER" = "$VER" ] || echo "! You asked for $VER but the zip is $ZVER — the VERSION file is what deploys."

# ---- sync repo (preserve .git; wrangler.jsonc comes from the zip, IDs baked in) ----
if command -v rsync >/dev/null; then
  rsync -a --delete --exclude='.git/' "$SRC"/ "$REPO"/
  echo "→ Synced with rsync"
else
  echo "! rsync not installed (pkg install rsync) — copying without removing deleted files"
  cp -rf "$SRC"/. "$REPO"/
fi

# ---- commit + push ----
cd "$REPO"; git add -A
if git diff --cached --quiet; then
  echo "✗ Nothing changed — this version looks already deployed."; exit 1
fi
if [ -f commit.txt ]; then git commit -F commit.txt; else git commit -m "release: v$ZVER"; fi
git push
echo ""
echo "✓ v$ZVER pushed — GitHub Actions is deploying now."
echo "  Check: repo → Actions tab, then /api/health once it's green."
