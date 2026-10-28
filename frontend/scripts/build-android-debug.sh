#!/bin/bash
# Build the website, copy it into the Android project, and produce a debug APK.
# The debug APK is signed with the automatic debug key and can be installed on a phone.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/run-with-env.js npx react-scripts build
npx cap sync android

cd android
chmod +x ./gradlew
./gradlew assembleDebug --no-daemon

apk="app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$apk" ]]; then
  echo "debug APK was not produced" >&2
  exit 1
fi
echo "Android debug APK: $(pwd)/$apk"
