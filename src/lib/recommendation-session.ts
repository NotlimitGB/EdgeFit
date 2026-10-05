import type { RecommendationResult } from "@/types/domain";
import { getSafeSessionStorage } from "@/lib/browser-session-storage";
import { EMPTY_PURCHASE_PREFERENCES, purchasePreferencesSchema, type PurchasePreferences } from "@/lib/purchase-preferences";
import { persistRecommendationSessionState, isSavedResultToken, RECOMMENDATION_RESULT_STORAGE_KEY,
  PURCHASE_PREFERENCES_STORAGE_KEY, SAVED_RESULT_TOKEN_STORAGE_KEY } from "@/lib/saved-result-contract";

interface RecommendationSessionSnapshot {
  recommendation: RecommendationResult;
  purchasePreferences: PurchasePreferences;
  savedResultToken: string | null;
}

// Written/read only in the browser. Never share rider data in server module state.
let memory: RecommendationSessionSnapshot | null = null;
let preferMemory = false;
let cachedKey: string | undefined;
let cachedSnapshot: RecommendationSessionSnapshot | null = null;
const listeners = new Set<() => void>();

export function subscribeRecommendationSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function storeRecommendationForNavigation(
  recommendation: RecommendationResult,
  token: string | null,
  purchasePreferences: PurchasePreferences,
) {
  if (typeof window === "undefined") return;
  memory = { recommendation, purchasePreferences, savedResultToken: isSavedResultToken(token) ? token : null };
  preferMemory = true;
  try {
    const storage = getSafeSessionStorage();
    if (storage) {
      persistRecommendationSessionState(storage, recommendation, token, purchasePreferences);
      // A write-only storage object is not sufficient for the result reader.
      preferMemory = storage.getItem(RECOMMENDATION_RESULT_STORAGE_KEY) !== JSON.stringify(recommendation) ||
        storage.getItem(PURCHASE_PREFERENCES_STORAGE_KEY) !== JSON.stringify(purchasePreferences) ||
        storage.getItem(SAVED_RESULT_TOKEN_STORAGE_KEY) !== memory.savedResultToken;
    }
  } catch { /* Keep the complete, latest snapshot after any partial write. */ }
  cachedKey = undefined;
  for (const listener of listeners) listener();
}

export function getRecommendationSessionSnapshot(): RecommendationSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  if (preferMemory) return memory;
  const storage = getSafeSessionStorage();
  if (!storage) return memory;
  try {
    const rawResult = storage.getItem(RECOMMENDATION_RESULT_STORAGE_KEY);
    const rawPreferences = storage.getItem(PURCHASE_PREFERENCES_STORAGE_KEY);
    const rawToken = storage.getItem(SAVED_RESULT_TOKEN_STORAGE_KEY);
    const key = JSON.stringify([rawResult, rawPreferences, rawToken]);
    if (key === cachedKey) return cachedSnapshot;
    cachedKey = key;
    cachedSnapshot = null;
    if (!rawResult) return null;
    let preferences = EMPTY_PURCHASE_PREFERENCES;
    try {
      const parsed = purchasePreferencesSchema.safeParse(JSON.parse(rawPreferences ?? "null"));
      if (parsed.success) preferences = parsed.data;
    } catch { /* Same empty-preferences behavior as the existing reader. */ }
    let recommendation: RecommendationResult;
    try { recommendation = JSON.parse(rawResult) as RecommendationResult; } catch { return null; }
    cachedSnapshot = {
      recommendation,
      purchasePreferences: preferences,
      savedResultToken: isSavedResultToken(rawToken) ? rawToken : null,
    };
    return cachedSnapshot;
  } catch { return memory; }
}

export function getEmptyRecommendationSessionSnapshot() { return null; }
