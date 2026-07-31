# 人物桌宠待机四帧提示词

## 使用方式

上传 `art/person/canonical/person-base-green.png` 作为唯一角色参考图。生成一张包含四个分离姿势的横向动作条，不要分别生成四张图片。

## 主提示词

```text
Use case: identity-preserve
Asset type: four-frame horizontal idle-animation source strip for a desktop-pet sprite

Input images:
- Image 1: the approved canonical character reference. This image is the single source of truth for identity, face, hairstyle, outfit, proportions, palette, brooch design, and illustration style.

Primary request:
Create one wide horizontal source strip containing exactly four separate full-body poses of the same approved chibi woman from Image 1. These four poses form a calm seamless idle loop. Draw all four poses together as one coherent animation family, from left to right in chronological order.

Exact frame sequence from left to right:
1. Neutral relaxed standing pose, eyes open, arms naturally at the sides.
2. Subtle inhale: torso and shoulders rise very slightly, hair tips lift minimally, eyes remain open.
3. Gentle blink: same standing pose, both eyes naturally closed, torso settling downward slightly.
4. Subtle exhale: eyes open again, body returns almost to frame 1 with a tiny relaxed sway.

Identity and design lock for every pose:
- Preserve exactly the same recognizable oval face, eye shape and color, eyebrows, small nose, gentle smile, and friendly expression family from Image 1.
- Preserve exactly the same straight black shoulder-length center-parted hair, smooth crown, curved-in ends, hair volume, highlights, and silhouette.
- Preserve exactly the same approximately 2.6-head-tall chibi proportions, head size, torso length, arm length, leg length, hand shape, and shoe shape.
- Preserve exactly the same medium-gray suit, white collared shirt, black-and-gray plaid necktie, black shoes, and detailed gold/navy/pink chest brooch in the same position.
- Preserve the same polished 2D chibi rendering, clean dark hand-drawn outline, soft cel-painterly shading, glossy eyes, warm cheeks, and color palette.
- Do not redesign, simplify, remove, enlarge, mirror, or move any clothing detail or brooch element between poses.

Motion and registration:
- Idle movement must be subtle and low-distraction; no waving, walking, talking, jumping, head turn, or large gesture.
- All four figures must have the same apparent scale and occupy the same vertical range.
- Keep the shoes on one shared horizontal baseline in every pose.
- Keep head center, torso center, and feet center aligned consistently so animation playback does not jump sideways or resize.
- The four figures must be fully separated with generous empty green space between them; no touching or overlapping hair, hands, clothing, or outlines.
- Leave generous padding around the outermost figures. No body part may touch or cross the canvas edge.

Scene and background:
- One perfectly flat solid #00FF00 chroma-key background across the entire strip.
- The background must be exactly one uniform color with no cell boxes, separators, grid, labels, gradients, texture, floor, horizon, reflection, lighting variation, or shadows.
- Do not use #00FF00 or green spill anywhere on the characters.

Composition:
- Wide landscape strip, preferably 2048 x 1024 or wider.
- Exactly four complete, evenly spaced pose groups arranged in one horizontal row.
- No text, frame numbers, captions, arrows, timeline, borders, visible guides, watermark, signature, UI, scenery, furniture, handheld props, detached decoration, motion lines, glow, aura, cast shadow, contact shadow, or floor patch.
- Crisp opaque sprite-like edges. No semitransparent wisps or loose hair strands blending into the background.
```

## 负面提示词

```text
fewer than four poses, more than four poses, duplicate pose, multiple rows,
vertical layout, cropped figure, overlapping figures, touching figures, visible grid,
frame border, labels, frame numbers, text, watermark, signature,
identity drift, different face, different eye color, different hairstyle, bangs,
ponytail, hair-length change, outfit change, missing tie, changed plaid pattern,
missing brooch, different brooch, moved brooch, simplified brooch, extra accessory,
body-proportion change, head-size change, height change, inconsistent baseline,
walking, running, waving, talking, jumping, head turn, large gesture,
photorealistic, 3D render, flat vector, pixel art, anime screenshot,
white background, transparent checkerboard, gradient green, background scene,
floor, horizon, cast shadow, contact shadow, glow, motion lines, green spill
```

## 验收标准

- 横向一排恰好四个人物，互不接触、没有裁切和边框。
- 四帧像同一个角色：脸、发型、身材、西装、领带和胸针完全一致。
- 四帧脚底在同一水平线，人物没有忽大忽小或左右跳动。
- 动作依次是站立、轻微吸气、闭眼眨眼、轻微呼气，可组成安静循环。
- 背景为单一纯绿色，没有地面、投影、文字或动作线。
