import { describe, expect, it } from "vitest";
import { getRecommendationShapeProfile, getShapeCompatibility } from "./shape-profile";

describe("recommendation shape profile", () => {
  it("prefers twin-like shapes for park riding", () => {
    const profile = getRecommendationShapeProfile({
      heightCm: 178,
      weightKg: 74,
      bootSizeEu: 43,
      boardLinePreference: "men",
      skillLevel: "intermediate",
      ridingStyle: "park",
      terrainPriority: "balanced",
      aggressiveness: "balanced",
      stanceType: "standard",
    });

    expect(profile.primary).toBe("twin");
    expect(profile.alternatives).toContain("asym-twin");
  });

  it("scores the primary shape above a mismatched one", () => {
    const profile = getRecommendationShapeProfile({
      heightCm: 178,
      weightKg: 74,
      bootSizeEu: 43,
      boardLinePreference: "men",
      skillLevel: "intermediate",
      ridingStyle: "freeride",
      terrainPriority: "soft-snow",
      aggressiveness: "aggressive",
      stanceType: "standard",
    });

    const preferred = getShapeCompatibility("tapered-directional", profile);
    const mismatched = getShapeCompatibility("twin", profile);

    expect(preferred.score).toBeGreaterThan(mismatched.score);
  });

  it("uses terrain priority to shift all-mountain profile toward directional shape", () => {
    const profile = getRecommendationShapeProfile({
      heightCm: 178,
      weightKg: 74,
      bootSizeEu: 43,
      boardLinePreference: "men",
      skillLevel: "intermediate",
      ridingStyle: "all-mountain",
      terrainPriority: "groomers-carving",
      aggressiveness: "balanced",
      stanceType: "standard",
    });

    expect(profile.primary).toBe("directional");
  });
});
