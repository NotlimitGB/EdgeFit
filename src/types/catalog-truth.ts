import type {
  BoardLine,
  BoardShape,
  CamberProfile,
  RidingStyle,
  SkillLevel,
  WidthType,
} from "@/types/domain";

export type AttributeTruthState = "known" | "missing" | "ambiguous";

export type AttributeProvenance =
  | "manual"
  | "official"
  | "merchant"
  | "legacy";

export type AttributeMethod =
  | "explicit"
  | "normalized"
  | "derived"
  | "manual-override"
  | "legacy-unverified";

export interface AttributeEvidence {
  state: AttributeTruthState;
  provenance: AttributeProvenance;
  method: AttributeMethod | null;
  sourceName: string | null;
  sourceUrl: string | null;
  observedAt: string | null;
  sourceField: string | null;
  sourceScaleMax?: number | null;
  normalizationRule?: string | null;
}

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type KnownRidingStyles = NonEmptyReadonlyArray<RidingStyle>;

export interface SkillApplicability {
  min: SkillLevel;
  max: SkillLevel;
}

export interface ProductAttributeEvidence {
  ridingStyles: AttributeEvidence;
  skillApplicability: AttributeEvidence;
  boardLine: AttributeEvidence;
  flex: AttributeEvidence;
  shapeType: AttributeEvidence;
  camberProfile: AttributeEvidence;
}

export interface ProductTruthV2 {
  truthModelVersion: 2;
  ridingStyles: KnownRidingStyles | null;
  skillApplicability: SkillApplicability | null;
  boardLine: BoardLine | null;
  flex: number | null;
  shapeType: BoardShape | null;
  camberProfile: CamberProfile | null;
  attributeEvidence: ProductAttributeEvidence;
}

export interface ProductSizeAttributeEvidence {
  waistWidthMm: AttributeEvidence;
  widthType: AttributeEvidence;
}

export interface ProductSizeTruthV2 {
  truthModelVersion: 2;
  waistWidthMm: number | null;
  widthType: WidthType | null;
  attributeEvidence: ProductSizeAttributeEvidence;
}
