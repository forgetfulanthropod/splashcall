import { CapacitorConfig } from '@capacitor/cli'
import dotenv from 'dotenv'

const envFile = dotenv.config()
// Prefer the process environment so cloud builds can set this without a .env file.
const serverUrl = process.env.CAP_SERVER_URL || envFile.parsed?.CAP_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.splashcall.app',
  appName: 'SplashCall',
  webDir: 'build',
  server: serverUrl
    ? {
        // Load the site from a URL instead of the files packed into the app.
        // Used for a live-reload shell. Leave unset for normal cloud builds.
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
      }
    : undefined,
}

export default config
