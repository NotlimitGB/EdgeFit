import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/saved-results", () => ({
  loadSavedResultByToken: (...parameters: unknown[]) =>
    mocks.load(...parameters),
}));
vi.mock("@/components/result/result-view", () => ({
  ResultView: () => null,
}));

import SavedResultPage, {
  dynamic,
  metadata,
  revalidate,
} from "@/app/result/[token]/page";

afterEach(() => vi.useRealTimers());
beforeEach(() => { mocks.load.mockReset(); mocks.notFound.mockClear(); });

describe("saved result route", () => {
  it("is dynamic, noindex, nofollow and no-referrer", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(metadata.referrer).toBe("no-referrer");
    expect(metadata.robots).toEqual(
      expect.objectContaining({ index: false, follow: false, noarchive: true }),
    );
    expect(metadata.alternates).toBeUndefined();
  });

  it("returns not-found for an unavailable bearer snapshot", async () => {
    mocks.load.mockResolvedValue(null);
    await expect(
      SavedResultPage({ params: Promise.resolve({ token: "invalid" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.load).toHaveBeenCalledWith("invalid");
  });

  it("keeps storage failures distinct from a genuinely missing result", async () => {
    mocks.load.mockRejectedValueOnce(new Error("saved result unavailable"));

    await expect(SavedResultPage({ params: Promise.resolve({ token: "valid-looking-token" }) }))
      .rejects.toThrow("saved result unavailable");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("bounds a stalled saved-result lookup without converting it to not-found", async () => {
    vi.useFakeTimers();
    mocks.load.mockImplementation(() => new Promise(() => undefined));
    const pending = SavedResultPage({ params: Promise.resolve({ token: "valid-looking-token" }) }).catch(error => error);

    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toMatchObject({ code: "OPERATION_DEADLINE" });
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
