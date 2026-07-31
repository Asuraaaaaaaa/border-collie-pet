# 人物桌宠角色基准图提示词

> 状态：已采用生成结果。原始绿幕图保存于 `art/person/canonical/person-base-green.png`，透明基准图保存于 `art/person/canonical/person-base.png`。

## 使用方式

同时上传两张参考图：

1. `/Users/asura/Downloads/人物.png`：人物身份、面部、发型和服装参考。
2. `src/assets/idle_0.png`：仅作为现有边牧桌宠的插画画风参考。

先只生成一张角色基准图，不要一次生成动作表。建议使用正方形高分辨率输出。

## 主提示词

```text
Use case: identity-preserve
Asset type: canonical full-body character anchor for a desktop-pet sprite set

Input images:
- Image 1: identity, facial-feature, hairstyle, and outfit reference for the person.
- Image 2: style reference only for the existing desktop pet's polished 2D chibi illustration treatment. Do not copy the dog anatomy or markings.

Primary request:
Transform the person in Image 1 into one original full-body 2.5-head-tall chibi character that will serve as the canonical identity reference for a desktop-pet animation set. The result must clearly resemble the person in Image 1 while using the same general illustration language as Image 2.

Subject and identity lock:
- One adult woman, shown alone and fully visible from head to shoes.
- Preserve the recognizable oval face shape, dark almond-shaped eyes, softly shaped eyebrows, small nose, gentle closed-mouth smile, and calm friendly expression from Image 1.
- Preserve the straight black shoulder-length hair, center part, smooth crown, and slightly curved-in hair ends from Image 1.
- Use cute but believable chibi proportions: approximately 2.5 heads tall, large head, compact torso, short arms and legs, small hands and shoes.
- Keep the body balanced and suitable for later walking, running, sitting, lying, sleeping, jumping, waving, head-tilting, looking-curious, and scratching-head animations.

Outfit lock:
- Preserve the medium-gray tailored suit jacket, clean white collared shirt, and black-and-gray plaid necktie.
- Preserve the visual idea and position of the chest decoration, but redesign it as a small simplified gold-and-navy ornamental brooch with no letters, logo, emblem, school mark, or readable symbol.
- Keep outfit shapes simple and stable enough to reproduce consistently across many animation frames.

Style and rendering:
- Polished 2D chibi character illustration matching the broad visual language of Image 2.
- Expressive large glossy eyes, clean dark hand-drawn outline, soft cel-painterly shading, gentle warm cheek color, subtle fabric shading, crisp readable silhouette.
- Friendly, charming, refined, and suitable for display at about 100-320 pixels tall.
- Avoid photorealism, 3D rendering, vector-flat corporate style, pixel art, anime screenshot styling, and excessive tiny details.

Pose and composition:
- Neutral relaxed standing pose, facing mostly forward with a very slight three-quarter turn.
- Arms relaxed naturally beside the body, feet visible and close together, shoulders level, head upright.
- Center the full character on the canvas with generous even padding on every side.
- Character should occupy roughly 72% of the canvas height, with no cropped hair, hands, clothing, legs, or shoes.

Scene and background:
- Perfectly flat solid #00FF00 chroma-key background for local background removal.
- The background must be exactly one uniform color with no gradient, texture, lighting variation, floor plane, horizon, reflection, or shadow.
- Do not use #00FF00 or green spill anywhere on the character.

Constraints:
- Generate exactly one character and one pose.
- Preserve the same face, hairstyle, outfit, proportions, palette, brooch design, and illustration style as a reusable canonical character design.
- No text, letters, numbers, watermark, signature, speech bubble, frame, grid, labels, UI, scenery, furniture, handheld object, detached decoration, motion line, glow, aura, cast shadow, contact shadow, or floor patch.
- Crisp opaque sprite-like edges; no semitransparent wisps or loose hair strands that blend into the background.
```

## 负面提示词

```text
multiple characters, multiple poses, character sheet, cropped body, close-up portrait,
photorealistic, realistic body proportions, 3D render, flat vector icon, pixel art,
identity drift, different face, different hairstyle, ponytail, bangs, short hair,
different outfit, skirt, casual clothing, missing tie, readable badge, school logo,
extra accessories, handbag, glasses, hat, text, watermark, signature,
background scene, white background, transparent checkerboard, gradient background,
floor, horizon, cast shadow, contact shadow, glow, motion lines, floating effects,
blurred edges, green clothing, green highlights, green spill, cropped shoes, cropped hair
```

## 验收标准

- 第一眼能看出与人物照片是同一个角色设定，而不是普通的随机 Q 版女性。
- 发型、脸型、眼眉和微笑稳定，灰色西装、格纹领带、简化徽章全部保留。
- 全身完整，约 2.5 头身，手脚清楚，可继续扩展全部动作。
- 画风与边牧素材协调，缩小到 `160 x 160` 附近仍能辨认。
- 背景为单一纯绿，无地面、投影、文字和额外物体。
