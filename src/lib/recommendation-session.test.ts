// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRecommendation } from "@/lib/recommendation/engine";
import { getOrCreateSessionId, getSessionId } from "@/lib/session-id";
import { getSafeSessionStorage } from "@/lib/browser-session-storage";
import { getRecommendationSessionSnapshot, storeRecommendationForNavigation, subscribeRecommendationSession } from "./recommendation-session";
import { RECOMMENDATION_RESULT_STORAGE_KEY } from "@/lib/saved-result-contract";

const result = getRecommendation({ heightCm: 178, weightKg: 74, bootSizeEu: 43,
  boardLinePreference: "men", skillLevel: "intermediate", ridingStyle: "all-mountain",
  terrainPriority: "balanced", aggressiveness: "balanced", stanceType: "standard" }, []);
const preferences = { budgetMaxRub: 50000 };
beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("browser recommendation handoff", () => {
  it("prefers the complete latest snapshot after a partial write", () => {
    storeRecommendationForNavigation(result, "A".repeat(43), { budgetMaxRub: null });
    const original = Storage.prototype.setItem;
    let writes = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      if (++writes === 2) throw new DOMException("Quota", "QuotaExceededError");
      original.call(this, key, value);
    });
    const fresh = { ...result, lengthRange: { min: 160, max: 165 } };
    storeRecommendationForNavigation(fresh, null, preferences);
    expect(getRecommendationSessionSnapshot()).toEqual({
      recommendation: fresh, purchasePreferences: preferences, savedResultToken: null,
    });
  });
  it.each(["getter", "getItem", "setItem", "removeItem"] as const)("keeps the whole result after %s failure", (fault) => {
    const stale = { ...result, lengthRange: { min: 140, max: 145 } };
    storeRecommendationForNavigation(stale, null, { budgetMaxRub: null });
    if (fault === "getter") vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    else vi.spyOn(Storage.prototype, fault).mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    expect(() => storeRecommendationForNavigation(result, null, preferences)).not.toThrow();
    const snapshot = getRecommendationSessionSnapshot();
    expect(snapshot?.recommendation).toBe(result);
    expect(snapshot?.purchasePreferences).toEqual(preferences);
    expect(getRecommendationSessionSnapshot()).toBe(snapshot);
    if (fault !== "removeItem") {
      expect(getOrCreateSessionId()).toBe("");
      expect(getSessionId()).toBeNull();
    }
  });
  it("recovers to healthy writes, stable reads and persisted identity", () => {
    const fault = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    storeRecommendationForNavigation(result, null, preferences);
    fault.mockRestore();
    const fresh = { ...result, lengthRange: { min: 160, max: 165 } };
    storeRecommendationForNavigation(fresh, "A".repeat(43), { budgetMaxRub: null });
    const snapshot = getRecommendationSessionSnapshot();
    expect(snapshot?.recommendation.lengthRange).toEqual(fresh.lengthRange);
    expect(snapshot?.savedResultToken).toBe("A".repeat(43));
    expect(getRecommendationSessionSnapshot()).toBe(snapshot);
    const id = getOrCreateSessionId();
    expect(id).not.toBe("");
    expect(getOrCreateSessionId()).toBe(id);
    expect(document.cookie).toContain("edgefit_session_id=");
    expect(window.sessionStorage.getItem(RECOMMENDATION_RESULT_STORAGE_KEY)).toBe(JSON.stringify(fresh));
  });
  it("notifies readers but does not keep browser data in SSR reads", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRecommendationSession(listener);
    storeRecommendationForNavigation(result, null, preferences);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    vi.stubGlobal("window", undefined);
    expect(getSafeSessionStorage()).toBeNull();
    expect(getRecommendationSessionSnapshot()).toBeNull();
  });
});
