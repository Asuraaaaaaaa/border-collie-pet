import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACTION_FRAME_COUNTS,
  CHARACTER_DEFINITIONS,
  DEFAULT_CHARACTER_ID,
  frameNamesForAction,
  getCharacterDefinition,
  resolveCharacterId,
} from "../src/characters.js";

test("falls back to the border collie for an unknown saved character", () => {
  assert.equal(resolveCharacterId("missing-character"), DEFAULT_CHARACTER_ID);
  assert.equal(getCharacterDefinition(null).id, DEFAULT_CHARACTER_ID);
});

test("defines the same required animation states for every character", () => {
  assert.equal(Object.keys(CHARACTER_DEFINITIONS).length, 2);
  assert.equal(
    Object.values(ACTION_FRAME_COUNTS).reduce((sum, count) => sum + count, 0),
    29,
  );
  assert.deepEqual(frameNamesForAction("walk"), [
    "walk_right_0.png",
    "walk_right_1.png",
    "walk_right_2.png",
    "walk_right_3.png",
  ]);
});

test("uses character-specific interaction labels", () => {
  assert.equal(CHARACTER_DEFINITIONS.person.interactionLabels.wag.trim(), "挥挥手");
  assert.equal(
    CHARACTER_DEFINITIONS[DEFAULT_CHARACTER_ID].interactionLabels.wag.trim(),
    "摇尾巴",
  );
});

test("ships every required character frame as a 480 by 432 RGBA PNG", () => {
  for (const character of Object.values(CHARACTER_DEFINITIONS)) {
    for (const action of Object.keys(ACTION_FRAME_COUNTS)) {
      for (const fileName of frameNamesForAction(action)) {
        const filePath = fileURLToPath(new URL(
          `../src/assets/characters/${character.assetDirectory}/${fileName}`,
          import.meta.url,
        ));
        const png = readFileSync(filePath);
        assert.equal(png.toString("ascii", 1, 4), "PNG", filePath);
        assert.equal(png.readUInt32BE(16), 480, filePath);
        assert.equal(png.readUInt32BE(20), 432, filePath);
        assert.equal(png[25], 6, `${filePath} must use RGBA color type`);
      }
    }
  }
});
