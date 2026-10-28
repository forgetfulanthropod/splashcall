import { FirebaseApp, FirebaseOptions, initializeApp } from 'firebase/app'
import { getAnalytics } from 'firebase/analytics'
import { Firestore, getFirestore } from "firebase/firestore"
import { isDev, isLocal } from 'environment'


const options: FirebaseOptions = {
    apiKey: process.env.REACT_APP_FIRE_API_KEY,
    authDomain: process.env.REACT_APP_FIRE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIRE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIRE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIRE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIRE_APP_ID,
    measurementId: process.env.REACT_APP_FIRE_MEASUREMENT_ID,
}

if (isDev) {
    for (const [key, value] of Object.entries(options)) {
        if (value == null) {
            console.error(`firebase key ${key} is not defined`)
        }
    }
}


let app: FirebaseApp = null
let db: Firestore = null

export function maybeInitialize(): void {
    if (options.apiKey == null || options.projectId == null) {
        return
    }
    try {
        if (app == null) {
            app = initializeApp(options)
            if (!isDev && !isLocal) getAnalytics()
        }
        if (db == null) {
            db = getFirestore(app)
        }
    } catch (e) {
        console.error("error initializing firebase:", e)
        return
    }
}


/** Initializes app and database if needed */
export function getDb(): Firestore {
    return db
}
