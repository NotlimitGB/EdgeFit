import { describe, expect, it } from "vitest";
import {
  ACQUISITION_STORAGE_KEY,
  buildAcquisitionAnalyticsPayload,
  buildFirstTouchAcquisitionContext,
  getOrCaptureFirstTouchAcquisitionContext,
} from "@/lib/analytics/acquisition-context";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}

const baseInput = {
  pathname: "/",
  search: "",
  referrer: "",
  selfReferralHosts: ["edge-fit.vercel.app"],
};

describe("first-touch acquisition context", () => {
  it.each([
    ["yandex", "cpc"],
    ["telegram", "community"],
    ["personal", "seed"],
  ])("captures allowlisted %s campaign context", (source, medium) => {
    const context = buildFirstTouchAcquisitionContext({
      ...baseInput,
      search: `?utm_source=${source}&utm_medium=${medium}&utm_campaign=edgefit_023a&yclid=secret`,
    });

    expect(context).toEqual({
      source,
      medium,
      campaign: "edgefit_023a",
      content: null,
      term: null,
      landingPath: "/",
      referrerDomain: null,
      classification: "campaign",
    });
    expect(JSON.stringify(context)).not.toContain("yclid");
  });

  it("preserves the first valid touch through navigation", () => {
    const storage = createStorage();
    const first = getOrCaptureFirstTouchAcquisitionContext({
      ...baseInput,
      storage,
      search: "?utm_source=yandex&utm_campaign=edgefit_023a",
    });
    const later = getOrCaptureFirstTouchAcquisitionContext({
      ...baseInput,
      storage,
      pathname: "/quiz",
      search: "?utm_source=telegram",
    });

    expect(later).toEqual(first);
    expect(later?.source).toBe("yandex");
    expect(later?.landingPath).toBe("/");
  });

  it("replaces corrupt storage with a safe current context", () => {
    const storage = createStorage();
    storage.setItem(ACQUISITION_STORAGE_KEY, "not-json");

    const context = getOrCaptureFirstTouchAcquisitionContext({
      ...baseInput,
      storage,
      pathname: "/quiz",
    });

    expect(context?.classification).toBe("direct_or_unknown");
    expect(context?.landingPath).toBe("/quiz");
    expect(storage.getItem(ACQUISITION_STORAGE_KEY)).toBe(
      JSON.stringify(context),
    );
  });

  it("stores only a normalized referrer hostname", () => {
    const context = buildFirstTouchAcquisitionContext({
      ...baseInput,
      referrer: "https://partner.example/path?secret=123",
    });

    expect(context.referrerDomain).toBe("partner.example");
    expect(context.classification).toBe("external_referral");
    expect(JSON.stringify(context)).not.toContain("secret");
    expect(JSON.stringify(context)).not.toContain("/path");
  });

  it.each([
    ["", "direct_or_unknown"],
    ["https://edge-fit.vercel.app/from", "self_referral"],
    ["https://partner.example/from", "external_referral"],
  ] as const)("classifies referrer %s", (referrer, classification) => {
    expect(
      buildFirstTouchAcquisitionContext({ ...baseInput, referrer })
        .classification,
    ).toBe(classification);
  });

  it("does not capture private saved-result paths", () => {
    const storage = createStorage();
    const context = getOrCaptureFirstTouchAcquisitionContext({
      ...baseInput,
      storage,
      pathname: `/result/${"a".repeat(43)}`,
    });

    expect(context).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it("rejects unsafe UTM values without storing their contents", () => {
    const context = buildFirstTouchAcquisitionContext({
      ...baseInput,
      search: "?utm_source=user@example.com&utm_campaign=https://bad.example&utm_medium=cpc",
    });

    expect(context.source).toBeNull();
    expect(context.campaign).toBeNull();
    expect(context.medium).toBe("cpc");
    expect(context.classification).toBe("direct_or_unknown");
    expect(JSON.stringify(context)).not.toContain("example.com");
  });

  it("projects flat first-party fields", () => {
    const context = buildFirstTouchAcquisitionContext({
      ...baseInput,
      search: "?utm_source=yandex&utm_campaign=edgefit_023a",
    });

    expect(buildAcquisitionAnalyticsPayload(context)).toMatchObject({
      acquisition_source: "yandex",
      acquisition_campaign: "edgefit_023a",
      acquisition_landing_path: "/",
      acquisition_classification: "campaign",
    });
  });
});
