#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

# Read version from manifest.json (simple JSON extractor)
VERSION=$(awk -F'"' '/"version"\s*:/ { print $4; exit }' "$ROOT_DIR/manifest.json")
PKG_NAME="notbuk-${VERSION}.zip"

echo "Building NotBuk v$VERSION"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/images" "${DIST_DIR}/scripts"

# Copy extension files
cp "$ROOT_DIR/manifest.json" "$DIST_DIR/"
cp "$ROOT_DIR/index.html" "$DIST_DIR/"
cp "$ROOT_DIR/index.js" "$DIST_DIR/"
cp "$ROOT_DIR/style.css" "$DIST_DIR/"
cp "$ROOT_DIR/background.js" "$DIST_DIR/"

# Copy images (PNGs, SVG, ICO if present)
cp "$ROOT_DIR/images"/icon-*.png "$DIST_DIR/images/" 2>/dev/null || true
cp "$ROOT_DIR/images"/*.svg "$DIST_DIR/images/" 2>/dev/null || true
cp "$ROOT_DIR/images"/*.ico "$DIST_DIR/images/" 2>/dev/null || true

# Create zip
# Zip the CONTENTS of dist so manifest.json is at the zip root
cd "$DIST_DIR"
rm -f "$ROOT_DIR/$PKG_NAME"
zip -qr "$ROOT_DIR/$PKG_NAME" .
echo "Created $PKG_NAME in $ROOT_DIR"
