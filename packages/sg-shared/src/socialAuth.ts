// ── Social sign-in (Google / GitHub) via Firebase ────────────────────────────
// The Firebase JS SDK runs the provider popup in the browser and returns an ID
// token; the API verifies it (no secret lives here). Config comes from Vite env
// so a Google API key is never committed to the repo:
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  GithubAuthProvider,
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
} from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
};

/** True when the Firebase web config is present; buttons hide when it is not. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

export type SocialProvider = "google" | "github";

let _auth: Auth | null = null;

function auth(): Auth {
  if (!firebaseConfigured) throw new Error("Social sign-in is not configured on this deployment.");
  if (!_auth) {
    const app: FirebaseApp = getApps().length
      ? (getApps()[0] as FirebaseApp)
      : initializeApp(config as { apiKey: string; authDomain?: string; projectId: string });
    _auth = getAuth(app);
  }
  return _auth;
}

/** Open the provider popup and return the Firebase ID token to POST to the API. */
export async function socialIdToken(provider: SocialProvider): Promise<string> {
  const providerObj =
    provider === "github" ? new GithubAuthProvider() : new GoogleAuthProvider();
  const credential = await signInWithPopup(auth(), providerObj);
  return credential.user.getIdToken();
}
