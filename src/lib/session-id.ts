import { getSafeSessionStorage, readSessionValue } from "@/lib/browser-session-storage";
const SESSION_STORAGE_KEY = "edgefit.session-id";
export const SESSION_COOKIE_NAME = "edgefit_session_id";

function writeSessionCookie(value: string) {
  if (typeof document === "undefined") {
    return;
  }

  try { document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; samesite=lax`; } catch { /* Browser policy may also disable cookies. */ }
}

export function getSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  return readSessionValue(SESSION_STORAGE_KEY);
}

export function getOrCreateSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const storage = getSafeSessionStorage();
    if (!storage) return "";
    const currentValue = storage.getItem(SESSION_STORAGE_KEY);
    if (currentValue) {
      writeSessionCookie(currentValue);
      return currentValue;
    }
    const nextValue = window.crypto.randomUUID();
    storage.setItem(SESSION_STORAGE_KEY, nextValue);
    writeSessionCookie(nextValue);
    return nextValue;
  } catch { return ""; }
}
