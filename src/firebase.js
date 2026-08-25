import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { isConfigComplete, missingKeys } from './firebaseConfig'

/* ── CLOUD IS OPTIONAL, AND THE TEST IS THE CONFIG ────────────────────
 *
 * THE DEFECT THIS FIXES. With no Firebase config the app used to call
 * initializeApp with six undefineds, hand the broken app to getAuth, and
 * wait for an onAuthStateChanged that never fires. App.jsx gates on
 * `user === undefined && !bootScope`, so a first-time visitor sat on the
 * spinner for ever with nothing on screen saying why. Every screen's
 * data was already on the device — block B made hydration local-first —
 * so the app was waiting for a cloud it had been told nothing about.
 *
 * GATED ON CONFIG ABSENCE, NEVER ON A FAILED CALL. This is the whole
 * safety property. A fallback that triggered when a request failed would
 * turn a flaky connection, an expired token or a Firestore outage into a
 * silent, permanent stop-syncing — the user would keep working and
 * nothing would reach their account. So the decision is made once, here,
 * from a value that cannot change at runtime, before any network call
 * exists to fail. `syncErrors` is what reports failed calls, and it is
 * untouched by this.
 *
 * A MISSING KEY AND AN EMPTY KEY ARE THE SAME THING. Vercel preview
 * environments carry the six names with empty values, which is how a
 * preview build gets a deterministic local-only mode rather than one
 * that depends on whether a `.env` happened to be uploaded.
 */

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

/** True when the app has a cloud to talk to. Read once, at module load,
 *  from a rule that lives in firebaseConfig.js and touches no SDK.
 *  Nothing at runtime can flip it. */
export const cloudEnabled = isConfigComplete(firebaseConfig)

/** For the message, never for the decision. */
export const missingConfigKeys = missingKeys(firebaseConfig)

if (!cloudEnabled) {
  /* Loud in the console, quiet in the UI. Settings carries the visible
     label — see LOCAL_ONLY_NOTE there. */
  console.warn(
    '[PrepIQ] Running LOCAL ONLY — no Firebase configuration.\n' +
    `Missing or empty: ${missingConfigKeys.join(', ')}\n` +
    'Everything works and is saved to this device. Nothing syncs, and ' +
    'sign-in is unavailable. Set the VITE_FIREBASE_* variables to enable ' +
    'the cloud.'
  )
}

/* initializeApp is NOT called without a config. Calling it with
   undefineds is what produced an auth object that never resolved. */
const app  = cloudEnabled ? initializeApp(firebaseConfig) : null
export const db   = cloudEnabled ? getFirestore(app) : null
export const auth = cloudEnabled ? getAuth(app) : null
