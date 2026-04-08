import { boardShapeLabels, terrainPriorityLabels } from "@/lib/content";
import type {
  BoardShape,
  Product,
  QuizInput,
  RecommendationShapeProfile,
} from "@/types/domain";

function createShapeProfile(
  primary: BoardShape,
  alternatives: BoardShape[],
  headline: string,
  description: string,
): RecommendationShapeProfile {
  return {
    primary,
    alternatives,
    headline,
    description,
  };
}

export function getRecommendationShapeProfile(
  input: QuizInput,
): RecommendationShapeProfile {
  if (input.terrainPriority === "switch-freestyle") {
    return createShapeProfile(
      "twin",
      ["asym-twin", "directional-twin"],
      "Сейчас логичнее смотреть в сторону twin или близких к нему форм.",
      "Приоритет на свич, side hits и более живое ощущение под ногами лучше всего раскрывается на twin. Если хочется оставить чуть больше универсальности, хорошим компромиссом остаётся асимметричный или направленный твин.",
    );
  }

  if (input.terrainPriority === "groomers-carving") {
    return createShapeProfile(
      input.ridingStyle === "park" ? "directional-twin" : "directional",
      input.ridingStyle === "park"
        ? ["twin", "directional"]
        : ["directional-twin", "tapered-directional"],
      "Сейчас логичнее смотреть в сторону более направленной формы.",
      "Если приоритетом являются трасса и дуга, направленная геометрия обычно даёт более собранный вход в поворот и спокойнее держит скорость. Направленный твин остаётся рабочим вариантом, если не хочется совсем терять универсальность.",
    );
  }

  if (input.terrainPriority === "soft-snow") {
    return createShapeProfile(
      input.ridingStyle === "all-mountain" && input.aggressiveness === "relaxed"
        ? "directional"
        : "tapered-directional",
      ["directional", "directional-twin"],
      "Сейчас логичнее смотреть в сторону направленной формы с запасом для мягкого снега.",
      "Если хочется больше уверенности в мягком снегу и разбитом рельефе, в приоритете оказываются направленные формы. Тейпер здесь особенно полезен, когда катание заметно смещено в freeride-сценарий.",
    );
  }

  if (input.ridingStyle === "park") {
    return createShapeProfile(
      "twin",
      ["asym-twin", "directional-twin"],
      "Сейчас логичнее смотреть в сторону twin или близких к нему форм.",
      "Для парка, свича и более игривой подачи безопаснее всего начинать с twin. Если хочется чуть больше универсальности вне парка, подойдёт и направленный твин.",
    );
  }

  if (input.ridingStyle === "freeride") {
    if (input.aggressiveness === "relaxed") {
      return createShapeProfile(
        "directional",
        ["tapered-directional", "directional-twin"],
        "Сейчас логичнее смотреть в сторону направленной формы.",
        "Во freeride-сценарии направленная геометрия обычно даёт больше спокойствия на скорости и понятнее ведёт доску носом вперёд. Тейпер здесь тоже в рабочей зоне.",
      );
    }

    return createShapeProfile(
      "tapered-directional",
      ["directional", "directional-twin"],
      "Сейчас логичнее смотреть в сторону направленной формы с тейпером.",
      "Если катание смещено в freeride и хочется больше запаса в мягком снегу, tapered directional обычно выглядит сильнее всего. Простая направленная форма тоже остаётся хорошим вариантом.",
    );
  }

  if (input.aggressiveness === "aggressive") {
    return createShapeProfile(
      "directional",
      ["directional-twin", "tapered-directional"],
      "Сейчас логичнее смотреть в сторону более направленной формы.",
      "Для более жёсткого all-mountain катания направленная геометрия часто даёт спокойнее вход в дугу и больше стабильности. Направленный твин остаётся хорошим компромиссом, если не хочется терять универсальность.",
    );
  }

  return createShapeProfile(
    "directional-twin",
    ["twin", "asym-twin", "directional"],
    "Сейчас логичнее смотреть в сторону направленного твина.",
    "Для универсального катания направленный твин обычно даёт лучший баланс: доска остаётся живой и понятной, но не уходит слишком далеко ни в парк, ни в чистый freeride.",
  );
}

export function getShapeCompatibility(
  shapeType: Product["shapeType"],
  profile: RecommendationShapeProfile,
) {
  if (!shapeType) {
    return {
      score: 0,
      reason: "Форма доски пока не уточнена, поэтому на неё нельзя опереться так же уверенно.",
    };
  }

  if (shapeType === profile.primary) {
    return {
      score: 10,
      reason: `Форма ${boardShapeLabels[shapeType]} лучше всего совпадает с вашим сценарием.`,
    };
  }

  if (profile.alternatives.includes(shapeType)) {
    return {
      score: 6,
      reason: `Форма ${boardShapeLabels[shapeType]} остаётся хорошим вариантом под ваш стиль катания.`,
    };
  }

  return {
    score: -6,
    reason: `Форма ${boardShapeLabels[shapeType]} сейчас выглядит менее приоритетной относительно ориентира "${boardShapeLabels[profile.primary]}" и сценария "${terrainPriorityLabels[profileDescriptionPriority(profile)]}".`,
  };
}

function profileDescriptionPriority(profile: RecommendationShapeProfile) {
  switch (profile.primary) {
    case "twin":
    case "asym-twin":
      return "switch-freestyle";
    case "directional":
      return "groomers-carving";
    case "tapered-directional":
      return "soft-snow";
    default:
      return "balanced";
  }
}

export function getTerrainPriorityLengthAdjustment(
  terrainPriority: QuizInput["terrainPriority"],
) {
  switch (terrainPriority) {
    case "switch-freestyle":
      return { min: -1, max: 0 };
    case "groomers-carving":
      return { min: 0, max: 1 };
    case "soft-snow":
      return { min: 1, max: 2 };
    default:
      return { min: 0, max: 0 };
  }
}

export function buildTerrainPriorityExplanation(
  terrainPriority: QuizInput["terrainPriority"],
) {
  switch (terrainPriority) {
    case "switch-freestyle":
      return "Дополнительный приоритет на свич и freestyle слегка удерживает рекомендацию ближе к более живой стороне диапазона.";
    case "groomers-carving":
      return "Дополнительный приоритет на трассу и дугу чуть смещает подбор к более собранной длине и направленной форме.";
    case "soft-snow":
      return "Дополнительный приоритет на мягкий снег даёт небольшой сдвиг к длине и форме с большим запасом вне трассы.";
    default:
      return "Приоритет выбран как универсальный, поэтому сервис не смещает подбор лишний раз в парк или freeride.";
  }
}
