# SplashCall on your phone, from the browser

SplashCall is a website wrapped in a real Android app and a real iPhone app. The wrapper is [Capacitor](https://capacitorjs.com/). You do not install Android Studio, Xcode, Node, or anything else on your Windows PC. GitHub builds the apps. Android builds on a Linux machine. iPhone builds on a Mac that GitHub provides, because this repository is public (those Mac minutes are free while the repository stays public).

The app id on both phones is `com.splashcall.app`.

## Android: get an APK onto the Moto G Power

1. Open this repository on GitHub in Chrome.
2. Click **Actions**.
3. Click **Mobile builds** in the left column.
4. Click **Run workflow**, leave “Also upload an iPhone build” turned off, and click the green **Run workflow** button.
5. Wait until the **Android debug APK** job is green. The first run takes several minutes.
6. Open that run, scroll to **Artifacts**, and download **SplashCall-android-debug**.
7. Unzip it. Inside is `app-debug.apk`.
8. Get that file onto the phone (email it to yourself, or plug the phone in and copy it).
9. On the phone, open the file. If Android asks, allow installs from Chrome or Files. This copy is signed with a debug key, so Android will say it is not from the Play Store. That is expected.
10. Install, then open SplashCall.

You can run that workflow again after any change. Each green run has a new APK.

The APK is a debug build for your own phone. It is not the file you would upload to the Play Store. A Play Store listing needs a separate release key that you create once and keep. That step is not required to try the app.

## Day to day, still without installing tools

Change the app in the cloud (this Cursor agent, or the GitHub website). Push the change to `main`. The **Mobile builds** workflow starts on its own and uploads a new APK to that run’s Artifacts list.

There is no separate “dev client” app to install. The APK already contains the website. Rebuilding is how you see a change on the phone.

Leave **Website the app should open** blank. Fill it in only when you want that one build to load a website address instead of the copy packed into the app.

## Calls between two phones

The games and the screen open with no extra accounts. A live call needs the small signaling server in `backend/` (`peer` on port 9000, path `/call`). This repository does not contain a public address for that server.

When you have a hostname for it, type just the hostname (for example `signal.example.com`, no `https://`) into **Run workflow** → **Peer server hostname**. You can also save it once as a GitHub **variable** (not a secret) named `REACT_APP_BACKEND_URL`. Settings → Secrets and variables → Actions → Variables.

Firebase is optional. The app runs without it. If you want the existing Firebase project connected, add these as GitHub **variables** (they end up inside the app, so they are not passwords):

- `REACT_APP_FIRE_API_KEY`
- `REACT_APP_FIRE_AUTH_DOMAIN`
- `REACT_APP_FIRE_PROJECT_ID`
- `REACT_APP_FIRE_STORAGE_BUCKET`
- `REACT_APP_FIRE_MESSAGING_SENDER_ID`
- `REACT_APP_FIRE_APP_ID`
- `REACT_APP_FIRE_MEASUREMENT_ID`

Names and a blank template are also in `frontend/.env.example`. Do not commit a filled-in `.env`.

## iPhone: what is already done, and what only you can do

The iPhone project is in `frontend/ios` and is set up for current Xcode (iOS 15 and later, Xcode 26). Every **Mobile builds** run compiles it for the iPhone simulator on GitHub’s Mac. That proves the project builds. A simulator build cannot be installed on your iPhone.

Installing on an iPhone requires Apple’s TestFlight, which requires your Apple account. Those secrets are not in this repository and must not be committed.

### One-time steps (browser only)

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) (paid, yearly). You can do this from Windows.
2. Confirm your Team ID. The old Xcode project used `ZH62Y74U6U`, and that value is still in the iPhone project. In [Apple Developer](https://developer.apple.com/account) → Membership, check the Team ID. If it is different, say so and the project line `DEVELOPMENT_TEAM` needs to change. You will also paste the Team ID into GitHub in step 6.
3. Register the app id if it is not already there. Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App → Bundle ID **Explicit** → `com.splashcall.app`. Leave Push Notifications off. The app does not use push, and a push setting would make signing fail.
4. Create the app record. [App Store Connect](https://appstoreconnect.apple.com/) → Apps → **+** → New App. Platform iOS, bundle id `com.splashcall.app`, name SplashCall. You can fill the store listing later. TestFlight needs this record to exist.
5. Create an API key. App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → **+**. Name it `SplashCall GitHub`. Access **Admin** (App Manager is enough if Admin is not offered). Download the `.p8` file when Apple offers it. Apple will not show that file again. Also copy the **Key ID** and the **Issuer ID** at the top of that page.
6. Add four GitHub Actions secrets. Repository → Settings → Secrets and variables → Actions → New repository secret. Paste the values. Do not put them in a file in this repository.

   | Secret name | What to paste |
   | --- | --- |
   | `APPLE_TEAM_ID` | The 10-character Team ID from step 2 |
   | `ASC_KEY_ID` | The Key ID |
   | `ASC_ISSUER_ID` | The Issuer ID |
   | `ASC_KEY_P8` | The entire `.p8` file, including the BEGIN and END lines |

7. Run the workflow again. Actions → Mobile builds → Run workflow. Turn on **Also upload an iPhone build to TestFlight**. Leave the peer hostname blank unless you have one.
8. When the **iOS TestFlight** job is green, open App Store Connect → your app → TestFlight. The build number is the GitHub run number. Apple may spend several minutes processing it.
9. If Apple asks about encryption, answer that the app only uses standard HTTPS. The project already says it does not use non-exempt encryption, so this prompt often does not appear.
10. Add yourself as a tester. TestFlight → Internal Testing → the default group, or create one. Internal testers are App Store Connect users on your team. Install Apple’s TestFlight app on the iPhone, accept the invite, and install SplashCall.

You do not create a signing certificate or a provisioning profile by hand. The Mac at GitHub asks Apple to sign the app with the API key from step 5 (Apple’s cloud signing).

### If TestFlight signing fails

The log is on the Actions run. The usual causes are: the Team ID does not match the API key’s team, the bundle id was not registered, the App Store Connect app record does not exist yet, or the API key is not Admin or App Manager. The `.p8` secret must be the whole file.

## What changed under the hood

- Capacitor was updated from the 2021 release (3) to 8 so the Android app targets current Android and the iPhone app builds on Xcode 26.
- The Android project is now in the repository (`frontend/android`). It had been left uncommitted.
- On a phone, the app is served from `https://localhost` inside the wrapper. That used to look like a development machine, so calls tried to reach a peer server on the phone itself. Calls now use the hostname you set, on port 443.
- The iPhone app keeps the microphone available when the screen locks (`audio` background mode). The old unused push / VoIP entitlement was removed so signing does not demand Push Notifications.
- Microphone and camera permission text is declared on both platforms.

## Nothing secret belongs in Git

Debug APKs are fine as GitHub artifacts. Apple keys, the `.p8` file, keystores, and a filled-in `.env` are not. GitHub’s secret box is the place for the four Apple values above.
