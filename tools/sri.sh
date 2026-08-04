#!/usr/bin/env bash
# Print the SRI (sha384) hash table for every published css/js file.
# Run from anywhere; paste the output into README.md, snippets/head.html,
# and demo/cdn.html at release time, then verify with tools/check-sri.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."

for f in theme/mco-theme.css core/mco-core.js map/mco-map.js map/cog-protocol.js; do
  hash=$(openssl dgst -sha384 -binary "$f" | openssl base64 -A)
  printf '%-24s sha384-%s\n' "$f" "$hash"
done
