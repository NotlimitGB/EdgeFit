const SESSION_STORAGE_KEY = "edgefit.session-id";
export const SESSION_COOKIE_NAME = "edgefit_session_id";

function writeSessionCookie(value: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; samesite=lax`;
}

export function getSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
}

export function getOrCreateSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const currentValue = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

  if (currentValue) {
    writeSessionCookie(currentValue);
    return currentValue;
  }

  const nextValue = window.crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextValue);
  writeSessionCookie(nextValue);
  return nextValue;
}
