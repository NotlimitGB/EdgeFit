import type { RecommendationResult } from "@/types/domain";

export const RECOMMENDATION_RESULT_STORAGE_KEY = "edgefit.latest-recommendation";
export const SAVED_RESULT_TOKEN_STORAGE_KEY = "edgefit.latest-result-token";
export const SAVED_RESULT_TOKEN_HEADER = "X-EdgeFit-Saved-Result-Token";

const SAVED_RESULT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const PRIVATE_SAVED_RESULT_PATH_PATTERN = /^\/result\/[^/]+\/?$/u;

interface RecommendationSessionStorage {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isSavedResultToken(value: unknown): value is string {
  return typeof value === "string" && SAVED_RESULT_TOKEN_PATTERN.test(value);
}

export function getSavedResultPath(token: string) {
  return isSavedResultToken(token) ? `/result/${encodeURIComponent(token)}` : null;
}

export function persistRecommendationSessionState(
  storage: RecommendationSessionStorage,
  recommendation: RecommendationResult,
  savedResultToken?: string | null,
) {
  storage.setItem(
    RECOMMENDATION_RESULT_STORAGE_KEY,
    JSON.stringify(recommendation),
  );

  if (isSavedResultToken(savedResultToken)) {
    storage.setItem(SAVED_RESULT_TOKEN_STORAGE_KEY, savedResultToken);
    return;
  }

  storage.removeItem(SAVED_RESULT_TOKEN_STORAGE_KEY);
}

export function isPrivateSavedResultPath(pathname: string) {
  return PRIVATE_SAVED_RESULT_PATH_PATTERN.test(pathname);
}

export function isSavedResultStoreSource(source?: string | null) {
  return Boolean(source?.startsWith("saved-result-"));
}
