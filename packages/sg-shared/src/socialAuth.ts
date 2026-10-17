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

/**
 * What to tell the user when the provider popup fails, or null when they simply
 * closed it (cancelling is not an error worth a red message).
 */
export function socialAuthErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string } | null)?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null;
  if (code === "auth/popup-blocked") return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
  if (code === "auth/account-exists-with-different-credential")
    return "This email already signs in with another provider. Use that one, or sign in with email.";
  if (code === "auth/network-request-failed") return "Could not reach the sign-in service. Check your connection and try again.";
  if (code === "auth/unauthorized-domain") return "Sign-in with this provider is not enabled for this site yet.";
  return "Sign-in was not completed. Try again.";
}

/** Open the provider popup and return the Firebase ID token to POST to the API. */
export async function socialIdToken(provider: SocialProvider): Promise<string> {
  const providerObj =
    provider === "github" ? new GithubAuthProvider() : new GoogleAuthProvider();
  const credential = await signInWithPopup(auth(), providerObj);
  return credential.user.getIdToken();
}
