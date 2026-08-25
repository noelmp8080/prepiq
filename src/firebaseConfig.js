/* ── THE RULE, WITH NO SDK ATTACHED ───────────────────────────────────
 *
 * Whether this build has a cloud is decided here, in a module that
 * imports nothing and does nothing. `firebase.js` reads the answer and
 * wires the SDK; this file can be imported by a test without
 * initialising an app, opening a connection, or reading a real `.env`
 * through a mock's back door.
 *
 * That separation is not tidiness. The first version of the test for
 * this had to `importOriginal()` on firebase.js to reach the predicate,
 * which ran initializeApp against whatever credentials happened to be in
 * the developer's `.env` — a unit test one typo away from touching a
 * live project.
 */

export const REQUIRED_KEYS = [
  'apiKey', 'authDomain', 'projectId',
  'storageBucket', 'messagingSenderId', 'appId',
]

/** Is every key present and non-empty?
 *
 *  A MISSING KEY AND AN EMPTY KEY ARE THE SAME THING. Vercel preview
 *  environments carry the six names with empty values, which is how a
 *  preview build gets a deterministic local-only mode rather than one
 *  that depends on whether a `.env` happened to be uploaded. Without the
 *  empty check, such a build would try to reach a project named "". */
export function isConfigComplete(config = {}) {
  return REQUIRED_KEYS.every(
    k => typeof config?.[k] === 'string' && config[k].trim() !== '')
}

/** Which keys are missing — for the message, never for the decision. */
export function missingKeys(config = {}) {
  return REQUIRED_KEYS.filter(
    k => !(typeof config?.[k] === 'string' && config[k].trim() !== ''))
}
