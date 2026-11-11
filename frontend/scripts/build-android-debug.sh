#!/bin/bash
# Build the website, copy it into the Android project, and produce a debug APK.
# The debug APK is signed with the automatic debug key and can be installed on a phone.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/run-with-env.js npx react-scripts build
npx cap sync android

# Gradle prefers android/local.properties over ANDROID_HOME. Write it from the
# SDK this job actually installed, and refuse a path that is not a directory.
sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -n "$sdk_root" ]]; then
  if [[ ! -d "$sdk_root" ]]; then
    echo "Android SDK directory does not exist: $sdk_root" >&2
    exit 1
  fi
  printf 'sdk.dir=%s\n' "$sdk_root" > android/local.properties
fi

cd android
chmod +x ./gradlew
./gradlew assembleDebug --no-daemon

apk="app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$apk" ]]; then
  echo "debug APK was not produced" >&2
  exit 1
fi
echo "Android debug APK: $(pwd)/$apk"
