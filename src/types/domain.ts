export type RidingStyle = "all-mountain" | "park" | "freeride";

export type SkillLevel = "beginner" | "intermediate" | "advanced";

export type Aggressiveness = "relaxed" | "balanced" | "aggressive";

export type StanceType = "standard" | "duck" | "unknown";

export type WidthType = "regular" | "mid-wide" | "wide";

export type BootDragRisk = "low" | "medium" | "high";

export type BoardLinePreference = "men" | "women" | "any";

export type BoardLine = "men" | "women" | "unisex";

export type BoardShape =
  | "twin"
  | "asym-twin"
  | "directional-twin"
  | "directional"
  | "tapered-directional";

export type CamberProfile =
  | "camber"
  | "rocker"
  | "flat"
  | "hybrid-camber"
  | "hybrid-rocker";

export type TerrainPriority =
  | "balanced"
  | "switch-freestyle"
  | "groomers-carving"
  | "soft-snow";

export type ProductDataStatus = "draft" | "verified";

export type RecommendationRole =
  | "best-overall"
  | "playful"
  | "stable"
  | "width-safe";

export type RecommendationConfidence = "high" | "medium" | "careful";

export interface QuizInput {
  heightCm: number;
  weightKg: number;
  bootSizeEu: number;
  boardLinePreference: BoardLinePreference;
  skillLevel: SkillLevel;
  ridingStyle: RidingStyle;
  terrainPriority: TerrainPriority;
  aggressiveness: Aggressiveness;
  stanceType: StanceType;
}

export interface ProductSize {
  sizeCm: number;
  sizeLabel?: string | null;
  waistWidthMm: number;
  recommendedWeightMin: number;
  recommendedWeightMax: number | null;
  widthType: WidthType;
  isAvailable: boolean;
}

export interface Product {
  id: string;
  slug: string;
  brand: string;
  modelName: string;
  seasonLabel?: string | null;
  descriptionShort: string;
  descriptionFull: string;
  ridingStyle: RidingStyle;
  skillLevel: SkillLevel;
  flex: number;
  priceFrom: number;
  imageUrl: string;
  galleryImages?: string[];
  affiliateUrl: string;
  isActive: boolean;
  boardLine: BoardLine;
  shapeType: BoardShape | null;
  camberProfile?: CamberProfile | null;
  dataStatus: ProductDataStatus;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceCheckedAt: string | null;
  scenarios: string[];
  notIdealFor: string[];
  sizes: ProductSize[];
}

export interface RecommendationMatch {
  product: Product;
  size: ProductSize;
  score: number;
  fitLabel: string;
  role: RecommendationRole;
  confidence: RecommendationConfidence;
  confidenceLabel: string;
  isCatalogReady: boolean;
  reasons: string[];
}

export interface RecommendationShapeProfile {
  primary: BoardShape;
  alternatives: BoardShape[];
  headline: string;
  description: string;
}

export type FocusedBoardVerdict = "GOOD" | "COMPROMISE" | "BETTER_OPTIONS";

export type FocusedBoardBuyability =
  | "AVAILABLE"
  | "NOT_CONFIRMED"
  | "UNKNOWN";

export type FocusedBoardSignalKey =
  | "length"
  | "weight"
  | "width"
  | "riding-style"
  | "skill"
  | "flex"
  | "shape"
  | "camber"
  | "board-line";

export interface FocusedBoardSignal {
  key: FocusedBoardSignalKey;
  state: "positive" | "tradeoff" | "unknown";
  title: string;
  detail: string;
}

export interface FocusedBoardAlternative {
  slug: string;
  brand: string;
  modelName: string;
  sizeLabel: string | null;
  role: RecommendationRole;
  decisionLabel: string;
}

export interface FocusedBoardCheck {
  board: {
    slug: string;
    brand: string;
    modelName: string;
  };
  verdict: FocusedBoardVerdict;
  bestFitSize: {
    sizeCm: number;
    sizeLabel: string;
  } | null;
  buyability: FocusedBoardBuyability;
  signals: FocusedBoardSignal[];
  alternatives: FocusedBoardAlternative[];
}

export interface RecommendationResult {
  algorithmVersion: string;
  input: QuizInput;
  lengthRange: {
    min: number;
    max: number;
  };
  recommendedWidthType: WidthType;
  shapeProfile: RecommendationShapeProfile;
  targetWaistWidthMm: number;
  bootDragRisk: BootDragRisk;
  explanation: string[];
  recommendedBoards: RecommendationMatch[];
  avoidBoards: RecommendationMatch[];
  focusedBoardCheck?: FocusedBoardCheck;
}
