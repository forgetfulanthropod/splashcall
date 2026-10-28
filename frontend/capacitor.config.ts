import { CapacitorConfig } from '@capacitor/cli'
import dotenv from "dotenv"
const envFile = dotenv.config()


const url = envFile?.parsed?.CAP_SERVER_URL

const config: CapacitorConfig = {
  "appId": "com.splashcall.app",
  "appName": "SplashCall",
  "webDir": url == null ? "build" : undefined,
  "bundledWebRuntime": false,
  "server": url == null ? undefined : {
    // serve files from network port instead of filesystem
    "url": url,
    "cleartext": false,
  },

  // "plugins": {
  //   "PushNotifications": {
  //     "presentationOptions": ["badge", "sound", "alert"],
  //   },
  // },
}

export default config
