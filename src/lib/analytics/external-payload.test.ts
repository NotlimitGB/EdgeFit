import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsEvents } from "@/lib/analytics/events";
import { getExternalAnalyticsPayload } from "@/lib/analytics/external-payload";

const { captureMock, initMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  initMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    capture: captureMock,
    init: initMock,
  },
}));

import {
  capturePostHogEvent,
  capturePostHogPageview,
  getPostHogConfiguration,
} from "@/lib/analytics/posthog-client";

describe("getExternalAnalyticsPayload", () => {
  it("keeps only the known step dimensions", () => {
    expect(
      getExternalAnalyticsPayload(analyticsEvents.quizStepViewed, {
        step_name: " Параметры ",
        step_number: 1,
        randomUnknownField: "drop me",
      }),
    ).toEqual({
      step_name: "Параметры",
      step_number: 1,
    });
  });

  it("does not send payload for events without external dimensions", () => {
    expect(
      getExternalAnalyticsPayload(analyticsEvents.homeViewed, {
        source: "home",
      }),
    ).toEqual({});
  });

  it("drops email while preserving its safe event source", () => {
    expect(
      getExternalAnalyticsPayload(analyticsEvents.emailSubmitted, {
        email: "user@example.com",
        source: "result-page",
      }),
    ).toEqual({ source: "result-page" });
  });

  it("drops body, boot and session dimensions", () => {
    expect(
      getExternalAnalyticsPayload(analyticsEvents.quizCompleted, {
        height_cm: 180,
        weight_kg: 80,
        boot_size_eu: 44,
        sessionId: "internal-session",
        session_id: "internal-session",
        riding_style: "all-mountain",
      }),
    ).toEqual({ riding_style: "all-mountain" });
  });

  it("drops nested values and arrays", () => {
    expect(
      getExternalAnalyticsPayload(analyticsEvents.productClicked, {
        board_slug: { value: "secret" },
        size_label: ["159W"],
        placement: "catalog",
      }),
    ).toEqual({ placement: "catalog" });
  });

  it("keeps safe canonical and exact offer provenance", () => {
    expect(
      getExternalAnalyticsPayload(analyticsEvents.productClicked, {
        board_slug: "bataleon-beyond-medals",
        offer_slug: "bataleon-beyond-medals-wide",
        placement: "board-page",
        size_cm: 161,
        size_label: "161W",
        source_size_label: "161 cm",
        width_type: "wide",
      }),
    ).toEqual({
      placement: "board-page",
      board_slug: "bataleon-beyond-medals",
      offer_slug: "bataleon-beyond-medals-wide",
      size_cm: 161,
      size_label: "161W",
      source_size_label: "161 cm",
      width_type: "wide",
    });
  });

  it("never forwards a merchant destination URL", () => {
    expect(
      getExternalAnalyticsPayload(analyticsEvents.productClicked, {
        board_slug: "yes-basic",
        destination_url: "https://merchant.example/secret",
      }),
    ).toEqual({ board_slug: "yes-basic" });
  });

  it("drops empty strings and non-finite numbers", () => {
    expect(
      getExternalAnalyticsPayload(analyticsEvents.productClicked, {
        board_slug: "   ",
        size_cm: Number.POSITIVE_INFINITY,
        placement: "catalog",
      }),
    ).toEqual({ placement: "catalog" });
  });

  it("does not reuse safe keys outside the event-specific allowlist", () => {
    expect(
      getExternalAnalyticsPayload(analyticsEvents.quizStepCompleted, {
        step_name: "Профиль",
        board_slug: "must-not-leak",
        placement: "must-not-leak",
      }),
    ).toEqual({ step_name: "Профиль" });
  });
});

describe("PostHog client", () => {
  beforeEach(() => {
    captureMock.mockClear();
    initMock.mockClear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is disabled when its project key is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");

    expect(getPostHogConfiguration()).toBeNull();
    await expect(
      capturePostHogEvent(analyticsEvents.quizStarted),
    ).resolves.toBeUndefined();
    expect(initMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("uses the default host and normalizes explicit configuration", () => {
    expect(getPostHogConfiguration(" project-key ", " ")).toEqual({
      key: "project-key",
      host: "https://us.i.posthog.com",
    });
    expect(
      getPostHogConfiguration("project-key", " https://eu.i.posthog.com "),
    ).toEqual({
      key: "project-key",
      host: "https://eu.i.posthog.com",
    });
  });

  it("initializes once and captures only sanitized explicit events", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-project-key");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://example.posthog.test");
    vi.stubGlobal("window", {});

    await Promise.all([
      capturePostHogEvent(analyticsEvents.productClicked, {
        board_slug: "yes-basic",
        offer_slug: "yes-basic-wide",
        email: "must-not-leak@example.com",
        destination_url: "https://merchant.example/secret",
      }),
      capturePostHogPageview("https://edgefit.example/catalog?q=wide"),
    ]);

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith(
      "test-project-key",
      expect.objectContaining({
        api_host: "https://example.posthog.test",
        advanced_disable_flags: true,
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        disable_surveys: true,
        person_profiles: "identified_only",
      }),
    );
    expect(captureMock).toHaveBeenCalledWith(analyticsEvents.productClicked, {
      board_slug: "yes-basic",
      offer_slug: "yes-basic-wide",
    });
    expect(captureMock).toHaveBeenCalledWith("$pageview", {
      $current_url: "https://edgefit.example/catalog?q=wide",
    });
  });
});
