#!/bin/bash
# Install the Android SDK pieces a SplashCall debug build needs.
# Safe to run more than once. Used by the cloud build and by this repository's scripts.
set -euo pipefail

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
mkdir -p "$SDK_ROOT/cmdline-tools"

if [[ ! -x "$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fL --retry 3 -o "$tmp/cmdtools.zip" \
    "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip"
  unzip -q "$tmp/cmdtools.zip" -d "$tmp"
  rm -rf "$SDK_ROOT/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK_ROOT/cmdline-tools/latest"
fi

sdkmanager="$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"
yes | "$sdkmanager" --sdk_root="$SDK_ROOT" --licenses >/dev/null || true
"$sdkmanager" --sdk_root="$SDK_ROOT" \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0"

echo "Android SDK ready at $SDK_ROOT"
echo "export ANDROID_SDK_ROOT=$SDK_ROOT"
echo "export ANDROID_HOME=$SDK_ROOT"

# GitHub Actions only passes these to later steps when they are written here.
# Do not hardcode a path in the workflow: this script may use the SDK that is
# already on the runner (for example /usr/local/lib/android/sdk).
if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "ANDROID_SDK_ROOT=$SDK_ROOT" >> "$GITHUB_ENV"
  echo "ANDROID_HOME=$SDK_ROOT" >> "$GITHUB_ENV"
fi
