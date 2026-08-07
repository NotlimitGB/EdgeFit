import type {
  BoardShape,
  BootDragRisk,
  QuizInput,
  WidthType,
} from "@/types/domain";

export type GoldenSupportProfile = "forgiving" | "balanced" | "supportive";

export type GoldenRecommendationCategory =
  | "weight-height"
  | "boot-stance"
  | "riding-intent"
  | "board-line"
  | "skill";

export interface GoldenRecommendationCase {
  readonly id: string;
  readonly title: string;
  readonly category: GoldenRecommendationCategory;
  readonly input: Readonly<QuizInput>;
  readonly expectation: {
    readonly length: {
      readonly saneMinCm: number;
      readonly saneMaxCm: number;
    };
    readonly widthTypesAllowed: readonly WidthType[];
    readonly targetWaistWidthMm: {
      readonly min: number;
      readonly max: number;
    };
    readonly bootDragRisksAllowed: readonly BootDragRisk[];
    readonly primaryShapesAllowed: readonly BoardShape[];
    readonly supportProfilesAllowed: readonly GoldenSupportProfile[];
    readonly rationale: readonly string[];
  };
  readonly tags: readonly string[];
}

export type GoldenRecommendationInvariantRule =
  | "length_not_shorter"
  | "length_not_longer"
  | "waist_not_narrower"
  | "width_not_narrower"
  | "boot_drag_not_lower"
  | "support_not_less_stable"
  | "same_physical_fit_expectation";

export type GoldenInvariantInputDimension =
  | "weightKg"
  | "bootSizeEu"
  | "ridingStyle"
  | "terrainPriority"
  | "aggressiveness"
  | "stanceType"
  | "boardLinePreference";

export interface GoldenRecommendationInvariant {
  readonly id: string;
  readonly leftCaseId: string;
  readonly rightCaseId: string;
  readonly varyingInput: GoldenInvariantInputDimension;
  readonly rule: GoldenRecommendationInvariantRule;
  readonly rationale: string;
}

const balancedIntermediate: QuizInput = {
  heightCm: 176,
  weightKg: 72,
  bootSizeEu: 43,
  boardLinePreference: "any",
  skillLevel: "intermediate",
  ridingStyle: "all-mountain",
  terrainPriority: "balanced",
  aggressiveness: "balanced",
  stanceType: "standard",
};

const bootBoundaryRider: QuizInput = {
  heightCm: 178,
  weightKg: 76,
  bootSizeEu: 43,
  boardLinePreference: "any",
  skillLevel: "intermediate",
  ridingStyle: "all-mountain",
  terrainPriority: "balanced",
  aggressiveness: "balanced",
  stanceType: "standard",
};

export const goldenRecommendationCases = [
  {
    id: "light_beginner_all_mountain",
    title: "Light beginner all-mountain rider",
    category: "weight-height",
    input: {
      heightCm: 158,
      weightKg: 40,
      bootSizeEu: 37,
      boardLinePreference: "any",
      skillLevel: "beginner",
      ridingStyle: "all-mountain",
      terrainPriority: "balanced",
      aggressiveness: "relaxed",
      stanceType: "unknown",
    },
    expectation: {
      length: { saneMinCm: 132, saneMaxCm: 142 },
      widthTypesAllowed: ["regular"],
      targetWaistWidthMm: { min: 226, max: 242 },
      bootDragRisksAllowed: ["low"],
      primaryShapesAllowed: ["twin", "directional-twin"],
      supportProfilesAllowed: ["forgiving"],
      rationale: [
        "Low body mass should keep the board compact even when manufacturer charts overlap.",
        "A beginner benefits from a forgiving, neutral shape rather than a demanding setup.",
      ],
    },
    tags: ["weight-band-35-45", "short-light", "light-beginner", "small-boot"],
  },
  {
    id: "tall_light_rider",
    title: "Tall and light rider",
    category: "weight-height",
    input: {
      heightCm: 190,
      weightKg: 50,
      bootSizeEu: 41,
      boardLinePreference: "men",
      skillLevel: "intermediate",
      ridingStyle: "all-mountain",
      terrainPriority: "balanced",
      aggressiveness: "balanced",
      stanceType: "standard",
    },
    expectation: {
      length: { saneMinCm: 140, saneMaxCm: 151 },
      widthTypesAllowed: ["regular"],
      targetWaistWidthMm: { min: 236, max: 250 },
      bootDragRisksAllowed: ["low"],
      primaryShapesAllowed: ["twin", "directional-twin"],
      supportProfilesAllowed: ["forgiving", "balanced"],
      rationale: [
        "Height may add stability room, but it must not overpower the rider's low weight.",
      ],
    },
    tags: ["weight-band-45-55", "very-tall", "tall-light", "height-weight-conflict"],
  },
  {
    id: "average_intermediate_rider",
    title: "Average intermediate rider",
    category: "weight-height",
    input: {
      heightCm: 174,
      weightKg: 60,
      bootSizeEu: 42,
      boardLinePreference: "any",
      skillLevel: "intermediate",
      ridingStyle: "all-mountain",
      terrainPriority: "balanced",
      aggressiveness: "balanced",
      stanceType: "standard",
    },
    expectation: {
      length: { saneMinCm: 146, saneMaxCm: 155 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 240, max: 254 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["twin", "directional-twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["A middle-weight intermediate rider fits a neutral all-mountain envelope."],
    },
    tags: ["weight-band-55-65", "average-height", "average-intermediate"],
  },
  {
    id: "weight_pair_70kg",
    title: "Weight monotonicity reference at 70 kg",
    category: "weight-height",
    input: { ...balancedIntermediate, weightKg: 70 },
    expectation: {
      length: { saneMinCm: 150, saneMaxCm: 158 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 244, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["This case anchors the lighter side of an otherwise identical weight pair."],
    },
    tags: ["weight-band-65-75", "weight-monotonicity-pair", "average-height"],
  },
  {
    id: "weight_pair_80kg",
    title: "Weight monotonicity reference at 80 kg",
    category: "weight-height",
    input: { ...balancedIntermediate, weightKg: 80 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 244, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced", "supportive"],
      rationale: ["Extra weight should not move an otherwise identical rider toward a shorter fit."],
    },
    tags: ["weight-band-75-85", "weight-monotonicity-pair", "average-height"],
  },
  {
    id: "short_heavy_rider",
    title: "Short and heavy rider",
    category: "weight-height",
    input: {
      heightCm: 160,
      weightKg: 90,
      bootSizeEu: 43.5,
      boardLinePreference: "any",
      skillLevel: "intermediate",
      ridingStyle: "all-mountain",
      terrainPriority: "balanced",
      aggressiveness: "balanced",
      stanceType: "standard",
    },
    expectation: {
      length: { saneMinCm: 155, saneMaxCm: 166 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 247, max: 261 },
      bootDragRisksAllowed: ["medium"],
      primaryShapesAllowed: ["directional-twin", "directional"],
      supportProfilesAllowed: ["balanced", "supportive"],
      rationale: ["Short stature may temper length, but it must not erase the support required by weight."],
    },
    tags: ["weight-band-85-95", "short-heavy", "height-weight-conflict"],
  },
  {
    id: "heavy_advanced_tall_rider",
    title: "Tall heavy advanced rider",
    category: "weight-height",
    input: {
      heightCm: 190,
      weightKg: 102,
      bootSizeEu: 45,
      boardLinePreference: "men",
      skillLevel: "advanced",
      ridingStyle: "freeride",
      terrainPriority: "groomers-carving",
      aggressiveness: "aggressive",
      stanceType: "standard",
    },
    expectation: {
      length: { saneMinCm: 162, saneMaxCm: 174 },
      widthTypesAllowed: ["mid-wide", "wide"],
      targetWaistWidthMm: { min: 257, max: 274 },
      bootDragRisksAllowed: ["medium", "high"],
      primaryShapesAllowed: ["directional", "tapered-directional", "directional-twin"],
      supportProfilesAllowed: ["supportive"],
      rationale: ["Weight, height and aggressive freeride intent all support a stable upper-range setup."],
    },
    tags: ["weight-band-95-110", "tall-heavy", "heavy-advanced", "large-boot"],
  },
  {
    id: "very_heavy_freerider",
    title: "Very heavy freerider",
    category: "weight-height",
    input: {
      heightCm: 188,
      weightKg: 118,
      bootSizeEu: 46,
      boardLinePreference: "any",
      skillLevel: "advanced",
      ridingStyle: "freeride",
      terrainPriority: "soft-snow",
      aggressiveness: "aggressive",
      stanceType: "standard",
    },
    expectation: {
      length: { saneMinCm: 166, saneMaxCm: 180 },
      widthTypesAllowed: ["wide"],
      targetWaistWidthMm: { min: 264, max: 282 },
      bootDragRisksAllowed: ["medium", "high"],
      primaryShapesAllowed: ["directional", "tapered-directional"],
      supportProfilesAllowed: ["supportive"],
      rationale: ["A 110+ kg freerider needs meaningful support and float without claiming one exact size."],
    },
    tags: ["weight-band-110-plus", "very-tall", "very-heavy", "large-boot"],
  },

  {
    id: "small_boot_37_standard",
    title: "Small boot EU 37",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 37 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["regular"],
      targetWaistWidthMm: { min: 228, max: 244 },
      bootDragRisksAllowed: ["low"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["A small boot normally needs no extra width buffer."],
    },
    tags: ["small-boot", "boot-eu-36-38"],
  },
  {
    id: "medium_boot_41_standard",
    title: "Medium boot EU 41",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 41 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["regular"],
      targetWaistWidthMm: { min: 238, max: 251 },
      bootDragRisksAllowed: ["low"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["A mid-size boot remains compatible with regular widths for this rider."],
    },
    tags: ["medium-boot", "boot-eu-40-42", "boot-monotonicity-pair"],
  },
  {
    id: "border_boot_43_standard",
    title: "Boot boundary EU 43",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 43 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 257 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["EU 43 is intentionally represented as a model-dependent width boundary."],
    },
    tags: ["borderline-width", "boot-eu-43"],
  },
  {
    id: "border_boot_43_5_standard",
    title: "Boot boundary EU 43.5",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 43.5 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 245, max: 259 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["Half-size boundaries should permit overlapping manufacturer fit envelopes."],
    },
    tags: ["borderline-width", "boot-eu-43-5"],
  },
  {
    id: "border_boot_44_standard",
    title: "Boot boundary EU 44",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 44 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 247, max: 261 },
      bootDragRisksAllowed: ["medium"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["EU 44 calls for explicit waist attention without declaring a universal category cutoff."],
    },
    tags: ["borderline-width", "boot-eu-44"],
  },
  {
    id: "border_boot_44_5_standard",
    title: "Boot boundary EU 44.5",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 44.5 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["mid-wide", "wide"],
      targetWaistWidthMm: { min: 252, max: 266 },
      bootDragRisksAllowed: ["medium", "high"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["The larger boundary boot should shift the safe envelope away from narrow-only options."],
    },
    tags: ["borderline-width", "large-boot", "boot-eu-44-5"],
  },
  {
    id: "large_boot_45_standard",
    title: "Large boot EU 45",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 45 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["mid-wide", "wide"],
      targetWaistWidthMm: { min: 255, max: 269 },
      bootDragRisksAllowed: ["medium", "high"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["EU 45 needs a cautious width envelope while retaining model-specific overlap."],
    },
    tags: ["large-boot", "boot-eu-45"],
  },
  {
    id: "large_boot_45_5_standard",
    title: "Large boot EU 45.5",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 45.5 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["mid-wide", "wide"],
      targetWaistWidthMm: { min: 257, max: 272 },
      bootDragRisksAllowed: ["medium", "high"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["EU 45.5 cannot be treated as safely narrow, though individual geometry still matters."],
    },
    tags: ["large-boot", "boot-eu-45-5"],
  },
  {
    id: "large_boot_46_standard",
    title: "Large boot EU 46 with standard stance",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 46 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["wide"],
      targetWaistWidthMm: { min: 261, max: 276 },
      bootDragRisksAllowed: ["medium", "high"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["A standard stance and large boot justify a clearly conservative width expectation."],
    },
    tags: ["large-boot", "boot-eu-46", "boot-monotonicity-pair", "stance-comparison"],
  },
  {
    id: "large_boot_46_duck",
    title: "Large boot EU 46 with duck stance",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 46, stanceType: "duck" },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["mid-wide", "wide"],
      targetWaistWidthMm: { min: 258, max: 274 },
      bootDragRisksAllowed: ["medium", "high"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["Duck stance may reduce the buffer slightly, but it cannot erase large-boot safety needs."],
    },
    tags: ["large-boot", "boot-eu-46", "duck-stance-large-boot", "stance-comparison"],
  },
  {
    id: "large_boot_46_unknown",
    title: "Large boot EU 46 with unknown stance",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 46, stanceType: "unknown" },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 162 },
      widthTypesAllowed: ["wide"],
      targetWaistWidthMm: { min: 261, max: 278 },
      bootDragRisksAllowed: ["high"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["Unknown stance should retain at least the safety concern of the standard stance."],
    },
    tags: ["large-boot", "boot-eu-46", "unknown-stance-large-boot", "stance-comparison"],
  },
  {
    id: "very_large_boot_49_standard",
    title: "Very large boot EU 49",
    category: "boot-stance",
    input: { ...bootBoundaryRider, bootSizeEu: 49 },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 164 },
      widthTypesAllowed: ["wide"],
      targetWaistWidthMm: { min: 270, max: 292 },
      bootDragRisksAllowed: ["high"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["A very large boot requires wide as the only acceptable category in this benchmark."],
    },
    tags: ["very-large-boot", "boot-eu-48-plus"],
  },

  {
    id: "relaxed_park_rider",
    title: "Relaxed park rider",
    category: "riding-intent",
    input: {
      ...balancedIntermediate,
      ridingStyle: "park",
      terrainPriority: "switch-freestyle",
      aggressiveness: "relaxed",
    },
    expectation: {
      length: { saneMinCm: 146, saneMaxCm: 155 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["twin", "asym-twin", "directional-twin"],
      supportProfilesAllowed: ["forgiving", "balanced"],
      rationale: ["Relaxed freestyle intent favors maneuverability and a forgiving support profile."],
    },
    tags: ["relaxed-park", "aggressiveness-comparison", "switch-freestyle"],
  },
  {
    id: "aggressive_park_rider",
    title: "Aggressive park rider",
    category: "riding-intent",
    input: {
      ...balancedIntermediate,
      ridingStyle: "park",
      terrainPriority: "switch-freestyle",
      aggressiveness: "aggressive",
    },
    expectation: {
      length: { saneMinCm: 148, saneMaxCm: 158 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["twin", "asym-twin", "directional-twin"],
      supportProfilesAllowed: ["balanced", "supportive"],
      rationale: ["Aggressive park riding may add support, but should remain freestyle-oriented."],
    },
    tags: ["aggressive-park", "aggressiveness-comparison", "switch-freestyle"],
  },
  {
    id: "balanced_all_mountain_rider",
    title: "Balanced all-mountain rider",
    category: "riding-intent",
    input: balancedIntermediate,
    expectation: {
      length: { saneMinCm: 150, saneMaxCm: 159 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["Balanced all-mountain intent should remain neutral across shape and support."],
    },
    tags: ["balanced-all-mountain", "terrain-comparison"],
  },
  {
    id: "switch_focused_all_mountain_rider",
    title: "Switch-focused all-mountain rider",
    category: "riding-intent",
    input: { ...balancedIntermediate, terrainPriority: "switch-freestyle" },
    expectation: {
      length: { saneMinCm: 148, saneMaxCm: 158 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["twin", "asym-twin", "directional-twin"],
      supportProfilesAllowed: ["forgiving", "balanced"],
      rationale: ["Switch priority should visibly move shape direction toward freestyle symmetry."],
    },
    tags: ["switch-focused-all-mountain", "switch-freestyle"],
  },
  {
    id: "carving_focused_all_mountain_rider",
    title: "Carving-focused all-mountain rider",
    category: "riding-intent",
    input: { ...balancedIntermediate, terrainPriority: "groomers-carving" },
    expectation: {
      length: { saneMinCm: 151, saneMaxCm: 161 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 244, max: 259 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional-twin", "directional", "tapered-directional"],
      supportProfilesAllowed: ["balanced", "supportive"],
      rationale: ["Carving priority should move the profile toward edge support and directional stability."],
    },
    tags: ["carving-focused-all-mountain", "groomers-carving"],
  },
  {
    id: "soft_snow_all_mountain_rider",
    title: "Soft-snow all-mountain rider",
    category: "riding-intent",
    input: { ...balancedIntermediate, terrainPriority: "soft-snow" },
    expectation: {
      length: { saneMinCm: 152, saneMaxCm: 162 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 244, max: 260 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional", "tapered-directional", "directional-twin"],
      supportProfilesAllowed: ["balanced", "supportive"],
      rationale: ["Soft snow should not trend shorter and should favor float-oriented shapes."],
    },
    tags: ["soft-snow-all-mountain", "terrain-comparison"],
  },
  {
    id: "intermediate_freerider",
    title: "Intermediate freerider",
    category: "riding-intent",
    input: {
      ...balancedIntermediate,
      skillLevel: "intermediate",
      ridingStyle: "freeride",
      terrainPriority: "soft-snow",
    },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 163 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 244, max: 260 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional", "tapered-directional", "directional-twin"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["Freeride direction adds stability and float without demanding an expert-only profile."],
    },
    tags: ["intermediate-freerider", "soft-snow"],
  },
  {
    id: "advanced_aggressive_freerider",
    title: "Advanced aggressive freerider",
    category: "riding-intent",
    input: {
      heightCm: 184,
      weightKg: 88,
      bootSizeEu: 44.5,
      boardLinePreference: "any",
      skillLevel: "advanced",
      ridingStyle: "freeride",
      terrainPriority: "soft-snow",
      aggressiveness: "aggressive",
      stanceType: "standard",
    },
    expectation: {
      length: { saneMinCm: 159, saneMaxCm: 171 },
      widthTypesAllowed: ["mid-wide", "wide"],
      targetWaistWidthMm: { min: 253, max: 270 },
      bootDragRisksAllowed: ["medium", "high"],
      primaryShapesAllowed: ["directional", "tapered-directional"],
      supportProfilesAllowed: ["supportive"],
      rationale: ["Advanced aggressive freeriding should retain a stable, supportive and directional profile."],
    },
    tags: ["advanced-aggressive-freerider", "soft-snow", "large-boot"],
  },
  {
    id: "comparison_park_rider",
    title: "Park side of the riding-style comparison",
    category: "riding-intent",
    input: { ...balancedIntermediate, ridingStyle: "park" },
    expectation: {
      length: { saneMinCm: 147, saneMaxCm: 156 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["twin", "asym-twin", "directional-twin"],
      supportProfilesAllowed: ["forgiving", "balanced"],
      rationale: ["This paired case represents the maneuverable side of the same rider's fit envelope."],
    },
    tags: ["park-freeride-comparison", "park"],
  },
  {
    id: "comparison_freeride_rider",
    title: "Freeride side of the riding-style comparison",
    category: "riding-intent",
    input: { ...balancedIntermediate, ridingStyle: "freeride" },
    expectation: {
      length: { saneMinCm: 153, saneMaxCm: 163 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 259 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional", "tapered-directional", "directional-twin"],
      supportProfilesAllowed: ["balanced", "supportive"],
      rationale: ["The same rider's freeride expectation should trend toward stability, not shorter sizing."],
    },
    tags: ["park-freeride-comparison", "freeride"],
  },

  {
    id: "board_line_men_reference",
    title: "Men board-line preference reference",
    category: "board-line",
    input: { ...balancedIntermediate, boardLinePreference: "men" },
    expectation: {
      length: { saneMinCm: 150, saneMaxCm: 159 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["Board-line preference must not alter the rider's physical fit envelope."],
    },
    tags: ["board-line-invariance", "men-preference"],
  },
  {
    id: "women_preference_rider",
    title: "Women board-line preference rider",
    category: "board-line",
    input: { ...balancedIntermediate, boardLinePreference: "women" },
    expectation: {
      length: { saneMinCm: 150, saneMaxCm: 159 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["The women preference changes catalog filtering, not rider physics."],
    },
    tags: ["board-line-invariance", "women-preference"],
  },
  {
    id: "any_line_preference_rider",
    title: "Any board-line preference rider",
    category: "board-line",
    input: { ...balancedIntermediate, boardLinePreference: "any" },
    expectation: {
      length: { saneMinCm: 150, saneMaxCm: 159 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional-twin", "twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["An unrestricted board-line preference preserves the same physical fit expectation."],
    },
    tags: ["board-line-invariance", "any-line-preference"],
  },

  {
    id: "skill_beginner_reference",
    title: "Beginner skill profile reference",
    category: "skill",
    input: { ...balancedIntermediate, skillLevel: "beginner" },
    expectation: {
      length: { saneMinCm: 148, saneMaxCm: 157 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["twin", "directional-twin"],
      supportProfilesAllowed: ["forgiving"],
      rationale: ["A beginner profile should avoid systematically demanding support and shape directions."],
    },
    tags: ["skill-comparison", "beginner-forgiveness"],
  },
  {
    id: "skill_intermediate_reference",
    title: "Intermediate skill profile reference",
    category: "skill",
    input: balancedIntermediate,
    expectation: {
      length: { saneMinCm: 150, saneMaxCm: 159 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["twin", "directional-twin", "directional"],
      supportProfilesAllowed: ["balanced"],
      rationale: ["Intermediate ability supports a neutral benchmark profile."],
    },
    tags: ["skill-comparison", "intermediate-balance"],
  },
  {
    id: "skill_advanced_reference",
    title: "Advanced skill profile reference",
    category: "skill",
    input: { ...balancedIntermediate, skillLevel: "advanced" },
    expectation: {
      length: { saneMinCm: 150, saneMaxCm: 161 },
      widthTypesAllowed: ["regular", "mid-wide"],
      targetWaistWidthMm: { min: 243, max: 258 },
      bootDragRisksAllowed: ["low", "medium"],
      primaryShapesAllowed: ["directional-twin", "directional", "twin"],
      supportProfilesAllowed: ["balanced", "supportive"],
      rationale: ["Advanced ability may accept more support without forcing an extreme setup."],
    },
    tags: ["skill-comparison", "advanced-support"],
  },
] as const satisfies readonly GoldenRecommendationCase[];

export const goldenRecommendationInvariants = [
  {
    id: "heavier_rider_not_shorter",
    leftCaseId: "weight_pair_70kg",
    rightCaseId: "weight_pair_80kg",
    varyingInput: "weightKg",
    rule: "length_not_shorter",
    rationale: "Increasing only rider weight must not clearly shorten the expected fit.",
  },
  {
    id: "larger_boot_width_not_narrower",
    leftCaseId: "medium_boot_41_standard",
    rightCaseId: "large_boot_46_standard",
    varyingInput: "bootSizeEu",
    rule: "width_not_narrower",
    rationale: "Increasing only boot size must not move the width category downward.",
  },
  {
    id: "larger_boot_waist_not_narrower",
    leftCaseId: "medium_boot_41_standard",
    rightCaseId: "large_boot_46_standard",
    varyingInput: "bootSizeEu",
    rule: "waist_not_narrower",
    rationale: "Increasing only boot size must not reduce the target waist envelope.",
  },
  {
    id: "larger_boot_drag_not_lower",
    leftCaseId: "medium_boot_41_standard",
    rightCaseId: "large_boot_46_standard",
    varyingInput: "bootSizeEu",
    rule: "boot_drag_not_lower",
    rationale: "Increasing only boot size must not reduce boot-drag concern.",
  },
  {
    id: "freeride_not_shorter_than_park",
    leftCaseId: "comparison_park_rider",
    rightCaseId: "comparison_freeride_rider",
    varyingInput: "ridingStyle",
    rule: "length_not_shorter",
    rationale: "The freeride side of the same rider's envelope should not trend shorter than park.",
  },
  {
    id: "aggressive_park_not_shorter",
    leftCaseId: "relaxed_park_rider",
    rightCaseId: "aggressive_park_rider",
    varyingInput: "aggressiveness",
    rule: "length_not_shorter",
    rationale: "Aggressive intent should not reduce stability by clearly shortening the fit.",
  },
  {
    id: "aggressive_park_not_less_stable",
    leftCaseId: "relaxed_park_rider",
    rightCaseId: "aggressive_park_rider",
    varyingInput: "aggressiveness",
    rule: "support_not_less_stable",
    rationale: "Aggressive intent should not receive a less supportive profile than relaxed intent.",
  },
  {
    id: "soft_snow_not_shorter_than_balanced",
    leftCaseId: "balanced_all_mountain_rider",
    rightCaseId: "soft_snow_all_mountain_rider",
    varyingInput: "terrainPriority",
    rule: "length_not_shorter",
    rationale: "Soft-snow priority should not trend shorter than balanced all-mountain intent.",
  },
  {
    id: "standard_not_narrower_than_duck",
    leftCaseId: "large_boot_46_duck",
    rightCaseId: "large_boot_46_standard",
    varyingInput: "stanceType",
    rule: "width_not_narrower",
    rationale: "Duck stance may trim safety buffer, but standard stance must not be narrower.",
  },
  {
    id: "unknown_stance_drag_not_lower",
    leftCaseId: "large_boot_46_standard",
    rightCaseId: "large_boot_46_unknown",
    varyingInput: "stanceType",
    rule: "boot_drag_not_lower",
    rationale: "Unknown stance must not be treated as safer than a known standard stance.",
  },
  {
    id: "women_line_same_physical_fit",
    leftCaseId: "board_line_men_reference",
    rightCaseId: "women_preference_rider",
    varyingInput: "boardLinePreference",
    rule: "same_physical_fit_expectation",
    rationale: "Board-line preference must not encode different rider physics.",
  },
  {
    id: "any_line_same_physical_fit",
    leftCaseId: "board_line_men_reference",
    rightCaseId: "any_line_preference_rider",
    varyingInput: "boardLinePreference",
    rule: "same_physical_fit_expectation",
    rationale: "Removing a line filter must preserve the physical fit expectation.",
  },
] as const satisfies readonly GoldenRecommendationInvariant[];
