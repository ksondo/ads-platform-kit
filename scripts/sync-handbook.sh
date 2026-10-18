#!/usr/bin/env sh
# Refresh docs/handbook from a local clone of ksondo/Software-Factory (the source of truth).
set -eu
SRC="${1:?usage: scripts/sync-handbook.sh <path-to-Software-Factory-clone>}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SHA="$(git -C "$SRC" rev-parse --short HEAD)"
tmp="$(mktemp)"; cp "$HERE/docs/handbook/MIRROR.md" "$tmp"
rm -rf "$HERE/docs/handbook"; mkdir -p "$HERE/docs/handbook"
cp -R "$SRC/docs/handbook/." "$HERE/docs/handbook/"
sed -E "s/at commit \`[0-9a-f]+\` on [^.]+\./at commit \`$SHA\` on $(date +'%d %B %Y')./" "$tmp" > "$HERE/docs/handbook/MIRROR.md"; rm -f "$tmp"
echo "docs/handbook refreshed from Software-Factory $SHA"
