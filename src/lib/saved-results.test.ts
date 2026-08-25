import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationResult } from "@/types/domain";

const mocks = vi.hoisted(() => {
  const responses: Array<unknown[] | Error> = [];
  const json = vi.fn((value: unknown) => value);
  const query = vi.fn(async (...parameters: unknown[]) => {
    void parameters;
    const response = responses.shift() ?? [];
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  const sql = Object.assign(query, { json });
  return { configured: true, json, query, responses, sql };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/config", () => ({
  базаНастроена: () => mocks.configured,
}));
vi.mock("@/lib/database/client", () => ({
  получитьКлиентБазы: () => mocks.sql,
}));

import {
  getSavedResultPath,
  isPrivateSavedResultPath,
  isSavedResultStoreSource,
  isSavedResultToken,
  loadPurchasePreferencesSessionState,
  persistRecommendationSessionState,
  RECOMMENDATION_RESULT_STORAGE_KEY,
  PURCHASE_PREFERENCES_STORAGE_KEY,
  SAVED_RESULT_TOKEN_STORAGE_KEY,
} from "@/lib/saved-result-contract";
import { сохранитьРезультатКвиза } from "@/lib/quiz-results";
import {
  generateSavedResultToken,
  hashSavedResultToken,
  isRecommendationResultSnapshot,
  isSavedResultsEnabled,
  loadSavedRecommendationByToken,
  loadSavedResultByToken,
  parseSavedResultSnapshot,
  SavedResultUnavailableError,
} from "@/lib/saved-results";

const recommendation: RecommendationResult = {
  algorithmVersion: "v1.6.3",
  input: {
    heightCm: 178,
    weightKg: 74,
    bootSizeEu: 43,
    boardLinePreference: "men",
    skillLevel: "intermediate",
    ridingStyle: "all-mountain",
    terrainPriority: "balanced",
    aggressiveness: "balanced",
    stanceType: "standard",
  },
  lengthRange: { min: 152, max: 156 },
  recommendedWidthType: "regular",
  shapeProfile: {
    primary: "directional-twin",
    alternatives: ["directional"],
    headline: "Универсальная форма",
    description: "Стабильность и контроль.",
  },
  targetWaistWidthMm: 250,
  bootDragRisk: "low",
  explanation: ["Рабочий диапазон рассчитан."],
  recommendedBoards: [],
  avoidBoards: [],
};

describe("saved result contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.responses.length = 0;
    mocks.configured = true;
    delete process.env.SAVED_RESULTS_ENABLED;
  });

  it.each([undefined, "", "false", "garbage"])(
    "keeps the feature disabled for %s",
    (value) => {
      expect(isSavedResultsEnabled(value)).toBe(false);
    },
  );

  it("enables only a trimmed case-insensitive true value", () => {
    expect(isSavedResultsEnabled("  TrUe ")).toBe(true);
  });

  it("creates random 256-bit bearer tokens and deterministic hashes", () => {
    const first = generateSavedResultToken();
    const second = generateSavedResultToken();

    expect(isSavedResultToken(first)).toBe(true);
    expect(isSavedResultToken(second)).toBe(true);
    expect(first).not.toBe(second);
    expect(hashSavedResultToken(first)).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(hashSavedResultToken(first)).toBe(hashSavedResultToken(first));
    expect(hashSavedResultToken(first)).not.toBe(hashSavedResultToken(second));
  });

  it("builds only safe private paths and classifies private analytics paths", () => {
    const token = generateSavedResultToken();
    expect(getSavedResultPath(token)).toBe(`/result/${token}`);
    expect(getSavedResultPath("bad/token")).toBeNull();
    expect(isPrivateSavedResultPath(`/result/${token}`)).toBe(true);
    expect(isPrivateSavedResultPath("/result")).toBe(false);
    expect(isSavedResultStoreSource("saved-result-top")).toBe(true);
    expect(isSavedResultStoreSource("result-top")).toBe(false);
  });

  it("stores a valid token separately and clears a stale token", () => {
    const token = generateSavedResultToken();
    const storage = { setItem: vi.fn(), removeItem: vi.fn() };

    persistRecommendationSessionState(storage, recommendation, token);
    expect(storage.setItem).toHaveBeenCalledWith(
      RECOMMENDATION_RESULT_STORAGE_KEY,
      JSON.stringify(recommendation),
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      PURCHASE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ budgetMaxRub: null }),
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      SAVED_RESULT_TOKEN_STORAGE_KEY,
      token,
    );

    persistRecommendationSessionState(storage, recommendation, null);
    expect(storage.removeItem).toHaveBeenCalledWith(
      SAVED_RESULT_TOKEN_STORAGE_KEY,
    );
  });

  it("stores purchase preferences separately from the recommendation", () => {
    const storage = { setItem: vi.fn(), removeItem: vi.fn() };
    persistRecommendationSessionState(
      storage,
      recommendation,
      null,
      { budgetMaxRub: 60_000 },
    );

    expect(storage.setItem).toHaveBeenCalledWith(
      RECOMMENDATION_RESULT_STORAGE_KEY,
      JSON.stringify(recommendation),
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      PURCHASE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ budgetMaxRub: 60_000 }),
    );
  });

  it("fails malformed session purchase preferences to no budget", () => {
    expect(
      loadPurchasePreferencesSessionState({
        getItem: () => JSON.stringify({ budgetMaxRub: "60000" }),
      }),
    ).toEqual({ budgetMaxRub: null });
    expect(
      loadPurchasePreferencesSessionState({
        getItem: () => JSON.stringify({ budgetMaxRub: 60_000 }),
      }),
    ).toEqual({ budgetMaxRub: 60_000 });
  });

  it("performs only the legacy insert while disabled", async () => {
    mocks.responses.push([{ id: "00000000-0000-4000-8000-000000000001" }]);

    await expect(
      сохранитьРезультатКвиза({
        вход: recommendation.input,
        результат: recommendation,
        идентификаторСессии: "session-1",
      }),
    ).resolves.toBeNull();

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain(
      "public_token_hash",
    );
  });

  it("stores the hash and full JSON snapshot in a separate optional update", async () => {
    process.env.SAVED_RESULTS_ENABLED = "true";
    const id = "00000000-0000-4000-8000-000000000001";
    mocks.responses.push([{ id }], [{ id }]);

    const token = await сохранитьРезультатКвиза({
      вход: recommendation.input,
      результат: recommendation,
      идентификаторСессии: "session-1",
    });

    expect(isSavedResultToken(token)).toBe(true);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.json).toHaveBeenCalledWith({
      snapshotVersion: 2,
      recommendation,
      purchasePreferences: { budgetMaxRub: null },
    });
    const updateParameters = mocks.query.mock.calls[1]?.slice(1) ?? [];
    expect(updateParameters).toContain(hashSavedResultToken(token as string));
    expect(updateParameters).toContainEqual({
      snapshotVersion: 2,
      recommendation,
      purchasePreferences: { budgetMaxRub: null },
    });
    expect(JSON.stringify(updateParameters)).not.toContain(token);
  });

  it("keeps the calculated result usable when the optional update fails", async () => {
    process.env.SAVED_RESULTS_ENABLED = "true";
    mocks.responses.push(
      [{ id: "00000000-0000-4000-8000-000000000001" }],
      new Error("database detail must stay private"),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      сохранитьРезультатКвиза({
        вход: recommendation.input,
        результат: recommendation,
      }),
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      "Saved result persistence unavailable.",
      expect.objectContaining({ category: "saved_result_update_failed" }),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("database detail");
  });

  it("keeps a legacy insert failure fatal", async () => {
    mocks.responses.push(new Error("legacy insert failed"));
    await expect(
      сохранитьРезультатКвиза({
        вход: recommendation.input,
        результат: recommendation,
      }),
    ).rejects.toThrow("legacy insert failed");
  });

  it("returns an exact valid snapshot by token hash", async () => {
    process.env.SAVED_RESULTS_ENABLED = "true";
    const token = generateSavedResultToken();
    mocks.responses.push([{ resultSnapshot: recommendation }]);

    await expect(loadSavedRecommendationByToken(token)).resolves.toEqual(
      recommendation,
    );
    const parameters = mocks.query.mock.calls[0]?.slice(1) ?? [];
    expect(parameters).toEqual([hashSavedResultToken(token)]);
    expect(JSON.stringify(parameters)).not.toContain(token);
  });

  it("loads legacy and versioned saved snapshots through one strict contract", async () => {
    process.env.SAVED_RESULTS_ENABLED = "true";
    const token = generateSavedResultToken();
    const versioned = {
      snapshotVersion: 2,
      recommendation,
      purchasePreferences: { budgetMaxRub: 60_000 },
    } as const;
    mocks.responses.push(
      [{ resultSnapshot: recommendation }],
      [{ resultSnapshot: versioned }],
    );

    await expect(loadSavedResultByToken(token)).resolves.toEqual({
      recommendation,
      purchasePreferences: { budgetMaxRub: null },
    });
    await expect(loadSavedResultByToken(token)).resolves.toEqual({
      recommendation,
      purchasePreferences: { budgetMaxRub: 60_000 },
    });
    expect(parseSavedResultSnapshot({ ...versioned, extra: true })).toBeNull();
  });

  it("does not create a DB client for disabled or malformed lookup", async () => {
    const token = generateSavedResultToken();
    await expect(loadSavedRecommendationByToken(token)).resolves.toBeNull();

    process.env.SAVED_RESULTS_ENABLED = "true";
    await expect(loadSavedRecommendationByToken("malformed")).resolves.toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("closes unknown and structurally invalid snapshots as not-found", async () => {
    process.env.SAVED_RESULTS_ENABLED = "true";
    const token = generateSavedResultToken();
    mocks.responses.push([], [{ resultSnapshot: { ...recommendation, extra: true } }]);

    await expect(loadSavedRecommendationByToken(token)).resolves.toBeNull();
    await expect(loadSavedRecommendationByToken(token)).resolves.toBeNull();
    expect(isRecommendationResultSnapshot(recommendation)).toBe(true);
  });

  it("sanitizes unavailable database failures", async () => {
    process.env.SAVED_RESULTS_ENABLED = "true";
    mocks.configured = false;

    await expect(
      loadSavedRecommendationByToken(generateSavedResultToken()),
    ).rejects.toEqual(new SavedResultUnavailableError());
  });

  it("declares the additive nullable schema and immutable token index", () => {
    const schema = readFileSync("db/schema.sql", "utf8");
    expect(schema).toContain("public_token_hash text");
    expect(schema).toContain("result_snapshot jsonb");
    expect(schema).toContain("chk_quiz_results_public_token_hash");
    expect(schema).toContain("chk_quiz_results_result_snapshot_object");
    expect(schema).toContain("chk_quiz_results_saved_result_coherence");
    expect(schema).toContain("uq_quiz_results_public_token_hash");
  });
});
