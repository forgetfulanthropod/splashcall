#!/bin/bash
# Checks the committed Android and iOS project files. Does not need a Mac.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "mobile config: $1" >&2; exit 1; }

python3 - <<'PY'
import plistlib
import sys
from pathlib import Path
root = Path(".")
info = plistlib.loads((root / "ios/App/App/Info.plist").read_bytes())
required = {
    "CFBundleDisplayName": "SplashCall",
    "NSMicrophoneUsageDescription": None,
    "NSCameraUsageDescription": None,
    "ITSAppUsesNonExemptEncryption": False,
}
for key, expected in required.items():
    if key not in info:
        sys.exit(f"Info.plist missing {key}")
    if expected is not None and info[key] != expected:
        sys.exit(f"Info.plist {key} is {info[key]!r}, expected {expected!r}")
modes = info.get("UIBackgroundModes", [])
if "voip" in modes:
    sys.exit("Info.plist still requests the voip background mode, which App Store rejects without PushKit")
if "audio" not in modes:
    sys.exit("Info.plist is missing the audio background mode, so a call would be suspended")
print("Info.plist ok")
PY

pbx="ios/App/App.xcodeproj/project.pbxproj"
grep -q "PRODUCT_BUNDLE_IDENTIFIER = com.splashcall.app;" "$pbx" || fail "iOS bundle id is not com.splashcall.app"
grep -q "IPHONEOS_DEPLOYMENT_TARGET = 15.0;" "$pbx" || fail "iOS deployment target is not 15.0"
grep -q "DEVELOPMENT_TEAM = ZH62Y74U6U;" "$pbx" || fail "iOS development team was not kept"
grep -q "MARKETING_VERSION = 1.2;" "$pbx" || fail "iOS marketing version is not 1.2"
test -f ios/App/App/SceneDelegate.swift || fail "SceneDelegate.swift missing"
test -f ios/App/App/AppDelegate.swift || fail "AppDelegate.swift missing"
test -f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png || fail "app icon missing"
test -f ios/App/App.xcworkspace/contents.xcworkspacedata || fail "Xcode workspace missing"
test -f ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme || fail "shared Xcode scheme missing"
grep -q "platform :ios, '15.0'" ios/App/Podfile || fail "Podfile platform is not iOS 15"
grep -q "CapacitorHaptics" ios/App/Podfile || fail "Podfile is missing CapacitorHaptics"
grep -q "CapacitorShare" ios/App/Podfile || fail "Podfile is missing CapacitorShare"
if grep -R -q "aps-environment" ios --include='*.entitlements' --include='*.plist'; then
  fail "push entitlement is still present; signing fails unless Push Notifications is enabled"
fi
grep -q "com.splashcall.app" capacitor.config.ts || fail "capacitor app id missing"

if [[ -f android/app/src/main/AndroidManifest.xml ]]; then
  grep -q 'android.permission.RECORD_AUDIO' android/app/src/main/AndroidManifest.xml || fail "Android mic permission missing"
  grep -q 'android.permission.CAMERA' android/app/src/main/AndroidManifest.xml || fail "Android camera permission missing"
  grep -q 'com.splashcall.app' android/app/build.gradle || fail "Android application id is not com.splashcall.app"
fi

python3 -m py_compile scripts/generate-icons.py
node --check scripts/run-with-env.js
node --check scripts/apply-react-scripts-svg-patch.js
echo "mobile config ok"
