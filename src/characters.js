export const DEFAULT_CHARACTER_ID = "border-collie";
export const CHARACTER_STORAGE_KEY = "linePuppyCharacter";

export const ACTION_FRAME_COUNTS = Object.freeze({
  idle: 4,
  walk: 4,
  run: 4,
  sit: 2,
  lying: 1,
  sleep: 1,
  jump: 3,
  wag: 4,
  tilt: 2,
  sniff: 2,
  scratch: 2,
});

const BORDER_COLLIE_INSETS = Object.freeze({
  lying: { top: 60, right: 8, bottom: 20, left: 8 },
  sit: { top: 22, right: 13, bottom: 9, left: 34 },
  idle: { top: 28, right: 12, bottom: 10, left: 25 },
});

const PERSON_INSETS = Object.freeze({
  lying: { top: 60, right: 14, bottom: 10, left: 14 },
  sit: { top: 28, right: 34, bottom: 10, left: 34 },
  wag: { top: 14, right: 46, bottom: 10, left: 46 },
  idle: { top: 14, right: 50, bottom: 10, left: 50 },
});

export const CHARACTER_DEFINITIONS = Object.freeze({
  "border-collie": Object.freeze({
    id: "border-collie",
    name: "边牧",
    alt: "边牧桌宠",
    assetDirectory: "border-collie",
    visualInsets: BORDER_COLLIE_INSETS,
    interactionLabels: Object.freeze({
      wag: "　摇尾巴",
      sniff: "　嗅一嗅",
      scratch: "　挠痒痒",
    }),
  }),
  person: Object.freeze({
    id: "person",
    name: "人物",
    alt: "人物桌宠",
    assetDirectory: "person",
    visualInsets: PERSON_INSETS,
    interactionLabels: Object.freeze({
      wag: "　挥挥手",
      sniff: "　好奇看看",
      scratch: "　挠挠头",
    }),
  }),
});

export function resolveCharacterId(value) {
  return Object.hasOwn(CHARACTER_DEFINITIONS, value)
    ? value
    : DEFAULT_CHARACTER_ID;
}

export function getCharacterDefinition(value) {
  return CHARACTER_DEFINITIONS[resolveCharacterId(value)];
}

export function frameNamesForAction(action) {
  const count = ACTION_FRAME_COUNTS[action];
  if (!count) throw new Error(`Unknown pet action: ${action}`);
  const prefix = action === "walk" ? "walk_right" : action;
  return Array.from({ length: count }, (_, index) => `${prefix}_${index}.png`);
}
