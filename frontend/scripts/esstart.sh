#!/bin/bash
# Watch the web app. Loads .env through scripts/run-with-env.js, so a missing .env is fine.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${ESBUILD_DONT_SERVE:-}" == "yes" ]]; then
  ./esbuild.js watch
else
  ./run-parallel.sh "npx serve -s ./build -p 3000" "./esbuild.js watch"
fi
