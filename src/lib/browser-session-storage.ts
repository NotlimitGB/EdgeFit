/** No memory fallback here: session identity must remain genuinely persisted. */
export function getSafeSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readSessionValue(key: string): string | null {
  try { return getSafeSessionStorage()?.getItem(key) ?? null; } catch { return null; }
}

export function writeSessionValue(key: string, value: string): boolean {
  try {
    const storage = getSafeSessionStorage();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch { return false; }
}
