# 人物桌宠剩余全部帧素材提示词

## 剩余素材数量

人物角色运行时共需 `29` 张帧素材，待机 `idle x4` 已完成。还需生成 `25` 张，分布在下列 `10` 张源图中：

| 建议源图文件名 | 动作 | 帧数 |
| --- | --- | ---: |
| `walk-right-green.png` | 向右行走 | 4 |
| `run-right-green.png` | 向右跑步 | 4 |
| `jump-green.png` | 跳跃 | 3 |
| `sit-green.png` | 坐下 | 2 |
| `lying-green.png` | 躺卧休息 | 1 |
| `sleep-green.png` | 睡眠 | 1 |
| `wave-green.png` | 挥手 | 4 |
| `tilt-green.png` | 歪头 | 2 |
| `curious-look-green.png` | 好奇观察 | 2 |
| `scratch-head-green.png` | 挠头 | 2 |

`happy` 复用歪头帧，`drag` 复用第一张歪头帧，不需要额外生成。向左移动由程序水平翻转向右素材实现，不需要另外生成。

## 使用方式

1. 每次生成都上传 `art/person/strips/idle-green.png` 作为主角色参考图。
2. 如果模型支持多图参考，再上传 `src/assets/characters/person/idle_0.png` 锁定单帧比例和轮廓。
3. 每次先粘贴下面的“公共固定提示词”，然后追加其中一组“动作提示词”，最后追加“公共负面提示词”。
4. 每个动作单独生成一张图。不要让模型把全部 `25` 帧塞进同一张图，否则很容易漏帧、串动作和改变人物造型。
5. 除睡眠素材可以参考已生成的躺卧图以外，所有动作都以同一张待机动作条为角色真值源，不要一组参考上一组导致造型逐步漂移。

## 公共固定提示词

```text
Use case: identity-preserve
Asset type: animation source strip for a transparent desktop-pet sprite

Input images:
- Image 1 is the approved idle animation strip and the single source of truth for character identity, face, hairstyle, outfit, proportions, palette, brooch design, rendering style, and apparent scale.
- Image 2, if provided, is the approved normalized neutral runtime frame and is used only as an additional proportion and silhouette reference.

Character identity lock:
- Draw exactly the same approved chibi woman in every pose.
- Preserve the same recognizable oval face, very large brown eyes, eyebrow shape, small nose, gentle smile, warm cheeks, and friendly expression family.
- Preserve the same straight black shoulder-length center-parted hair, smooth crown, curved-in ends, hair volume, highlights, and silhouette.
- Preserve the same approximately 2.6-head-tall chibi proportions, head size, torso length, limb thickness, hand shape, and black shoe shape.
- Preserve the same medium-gray suit, white collared shirt, black-and-gray plaid necktie, and detailed gold/navy/pink chest brooch on the same physical side of the jacket.
- Do not redesign, simplify, remove, enlarge, mirror, or move the tie, plaid pattern, jacket details, or brooch between poses.
- Preserve the same polished 2D chibi illustration style, clean dark hand-drawn outline, soft cel-painterly shading, glossy eyes, facial rendering, and color palette.

Registration and sprite-production rules:
- Draw all requested poses together as one coherent animation family in exact chronological order from left to right.
- Use exactly the requested number of complete separated poses in one horizontal row, never multiple rows.
- Every pose must have the same apparent character scale and body proportions.
- Keep the torso root and body center registered consistently inside every frame slot. The app moves the sprite itself, so the character must not drift horizontally between source slots.
- Keep the action's grounded frames on one shared horizontal baseline. Allow only the small vertical movement explicitly required by the action.
- Keep the complete body visible in every pose, including all hair, hands, extended limbs, shoes, jacket edges, and accessories.
- Leave generous empty space between poses and around the outer canvas edges. Poses must never touch, overlap, or cross into neighboring frame slots.

Background and composition:
- Use one perfectly flat solid #00FF00 chroma-key background across the entire image.
- The background must be exactly one uniform color with no cell boxes, separators, grid, labels, gradients, texture, floor, horizon, reflection, lighting variation, cast shadow, or contact shadow.
- Do not use #00FF00 or green spill anywhere on the character.
- For four poses, use a wide landscape canvas preferably 2048 x 1024 or wider. For two or three poses, keep enough horizontal room for generous separation. For one pose, use a centered full-body composition with generous padding.
- Use crisp opaque sprite-like edges with no blur, smear, afterimage, semitransparent wisps, or loose hair strands blending into the background.
- No text, frame numbers, captions, arrows, timeline, borders, visible guides, watermark, signature, UI, scenery, furniture, handheld prop, detached decoration, motion line, glow, aura, dust, or floor patch.
```

## 1. 向右行走 `walk_right x4`

```text
Create exactly four separate full-body poses of the approved character walking toward the viewer's screen-right edge. Use a readable three-quarter-right or clean side-facing view while preserving her recognizable face and hairstyle. The walk must be a natural compact chibi walk, not a run, march, skip, dance, tiptoe, or exaggerated power walk.

Exact frame sequence from left to right:
1. Right-facing contact pose: the leading leg reaches forward and the trailing leg extends back; the arms swing naturally in opposition.
2. Right-facing passing pose: the trailing foot passes the planted foot, the knees bend slightly, and the torso reaches the lowest point of the step.
3. Opposite right-facing contact pose: reverse the legs and arm swing from frame 1 while keeping the same stride length.
4. Opposite passing pose: the other foot passes, the body rises slightly, and the pose leads seamlessly back into frame 1.

Every pose must unmistakably face screen-right. Show a real alternating gait across all four frames. Keep the stride modest, the torso root horizontally stable, and the shoes on the same ground baseline. Hair tips, tie, and jacket hem may trail only very slightly. Keep the brooch attached to the same physical side of the jacket; do not flip it independently between frames.
```

## 2. 向右跑步 `run x4`

```text
Create exactly four separate full-body poses of the approved character running quickly toward the viewer's screen-right edge. Use a readable three-quarter-right or clean side-facing view. The action must read as a light energetic chibi run with a faster cadence and stronger limb extension than the walk, but it must remain compact and elegant rather than athletic, aggressive, or exaggerated.

Exact frame sequence from left to right:
1. Right-facing landing/contact pose: the leading foot reaches the ground, the trailing leg extends back, and the opposite arm leads forward.
2. Compression/passing pose: the planted leg bends, the other leg passes underneath, and the torso dips slightly.
3. Airborne exchange pose: both feet are briefly off the ground, the legs exchange front and back, and the arms reverse naturally.
4. Opposite landing/contact pose: the other foot reaches forward and the body begins the next compression, leading seamlessly back to frame 1.

Every pose must unmistakably face screen-right. Show a real alternating running gait rather than four versions of one stride. Keep the torso root horizontally registered and allow only a small rhythmic vertical bob. Hair ends, tie, and jacket hem may trail subtly behind the motion. Do not add speed lines, motion blur, afterimages, dust, floor marks, or shadows.
```

## 3. 跳跃 `jump x3`

```text
Create exactly three separate full-body poses of the approved character performing one small cheerful vertical jump in place. Keep a front or slight three-quarter-front view so the face, tie, suit, and brooch remain recognizable. This is a compact desktop-pet hop, not a long jump, dance leap, split jump, or running jump.

Exact frame sequence from left to right:
1. Takeoff preparation: both feet remain on the shared baseline, knees bend, the torso lowers slightly, and the arms draw in naturally.
2. Airborne apex: the complete character rises visibly above the baseline with both feet off the ground; knees bend gently and the arms lift slightly for balance.
3. Soft landing: both feet return to the same baseline, knees bend to absorb the landing, and the body begins returning toward the neutral stance.

Keep the body center on the same horizontal axis in all three frames. Frame 2 may move upward, but the scale must remain identical and the entire hair and shoes must stay inside the canvas. Do not draw a floor, shadow, landing mark, impact burst, dust, motion arc, or floating decoration.
```

## 4. 坐下 `sit x2`

```text
Create exactly two separate full-body seated poses of the approved character sitting naturally on the ground with no chair, cushion, furniture, or prop. Use a front or slight three-quarter-front view. Arrange the legs in a compact comfortable seated position that keeps the gray suit readable and does not hide or distort the body.

Exact frame sequence from left to right:
1. Relaxed seated pose with eyes open, a gentle smile, shoulders at rest, and hands resting naturally near the knees or lap.
2. The same seated pose with a tiny breathing change and a soft blink or slightly relaxed eyelids; hands, legs, clothing, scale, and body registration remain stable.

Both frames must share the same seated baseline, silhouette scale, torso center, leg arrangement, and brooch placement. The difference should be subtle but visible in animation. Do not show a transition from standing to sitting. Do not add furniture, floor, shadow, book, phone, cup, or other prop.
```

## 5. 躺卧休息 `lying x1`

```text
Create exactly one complete compact full-body pose of the approved character lying down and resting while still awake. Use a comfortable side-lying or gently curled reclining pose on the ground, with the head resting lightly on folded arms or raised just slightly, eyes open, and a calm friendly expression. Keep the face, center-parted hair, gray suit, plaid tie, brooch, hands, legs, and black shoes recognizable.

The complete horizontal silhouette must be centered with generous padding and must share a clear lower baseline. The pose should look like a natural precursor to sleep, not an injury, fall, collapse, crawl, or dramatic faint. Do not add a bed, pillow, blanket, cushion, furniture, floor, shadow, sleep symbol, text, or detached effect.
```

## 6. 睡眠 `sleep x1`

如果可以，除待机参考图外，再上传刚生成的 `lying-green.png` 作为第三张参考图，让睡眠姿势与躺卧姿势无缝衔接。

```text
Create exactly one complete compact full-body sleeping pose of the approved character. Match the approved awake lying pose as closely as possible in body scale, horizontal silhouette, limb placement, clothing folds, and baseline, but let the head and shoulders settle into a fully relaxed sleep. Both eyes are naturally closed, the mouth is calm, and the body language is peaceful.

Keep the same face, center-parted hair, gray suit, plaid tie, brooch, hands, legs, and black shoes. The character must remain recognizable even at desktop-pet size. Do not add a bed, pillow, blanket, cushion, furniture, floor, shadow, Z letters, sleep bubbles, drool, stars, moon, text, or any detached effect.
```

## 7. 挥手 `wag/wave x4`

```text
Create exactly four separate full-body poses of the approved character giving a friendly standing wave. Use a front or slight three-quarter-front view. She waves with her own right hand, which appears on the viewer's screen-left in a front-facing pose, while the other arm remains relaxed. Keep the brooch visible on its correct physical side.

Exact frame sequence from left to right:
1. The right hand lifts beside the head, palm visible, elbow comfortably bent.
2. The raised hand and forearm move slightly outward in the first half of the wave.
3. The raised hand and forearm move slightly inward across the second half of the wave.
4. The hand returns close to frame 1 so the cycle loops smoothly, with a tiny friendly head or shoulder response.

Keep both feet on one shared baseline and keep the torso, head size, and overall scale stable. Motion must come from the attached hand, wrist, forearm, and subtle shoulder movement. Fingers must remain clean and readable. Do not add wave marks, motion arcs, sparkles, hearts, punctuation, detached hands, extra fingers, text, or floating decoration.
```

## 8. 歪头 `tilt x2`

```text
Create exactly two separate full-body standing poses of the approved character making a cute inquisitive head tilt. Use a front-facing view, keep both feet and the torso centered, and preserve a warm happy expression. These two frames are also reused by the app as the happy reaction, so the expression should feel friendly and cheerful rather than confused, worried, dizzy, or exaggerated.

Exact frame sequence from left to right:
1. The head tilts gently toward her own left shoulder, with a small matching eye and eyebrow response; the torso remains almost still.
2. The head tilts gently toward her own right shoulder, with the eyes and eyebrows following naturally; the torso remains almost still.

Keep the face proportions rigid and recognizable; rotate or redraw the head and neck naturally rather than stretching the skull or warping facial features. Hair may follow the tilt subtly while keeping the same length and volume. Arms stay relaxed, both feet share one baseline, and the body scale and center remain stable. Do not add question marks, stars, hearts, motion arcs, or detached decoration.
```

## 9. 好奇观察 `sniff/curious-look x2`

```text
Create exactly two separate full-body standing poses of the approved character looking around with friendly curiosity. This replaces the border collie's sniffing action, so show visual observation and attentive body language rather than literal smelling. Keep the action subtle, useful as a short alternating loop, and clearly different from the larger happy head-tilt animation.

Exact frame sequence from left to right:
1. She turns her eyes and head slightly toward the viewer's screen-left, with a tiny upper-body lean and an attentive expression.
2. She turns her eyes and head slightly toward the viewer's screen-right, with the opposite tiny upper-body lean and the same attentive expression.

Keep both feet planted on one shared baseline, arms relaxed, torso root centered, and scale identical. Eye direction, eyelids, eyebrows, head turn, and slight posture shift should work together; do not merely slide pupils across a fixed face. Preserve facial proportions and do not rotate or warp the entire sprite. Do not add magnifying glasses, binoculars, question marks, scent lines, floating icons, props, or detached effects.
```

## 10. 挠头 `scratch x2`

```text
Create exactly two separate full-body standing poses of the approved character gently scratching or rubbing the side of her head in a shy, thoughtful manner. Use a front or slight three-quarter-front view. She uses her own right hand, which appears on the viewer's screen-left in a front-facing pose; the other arm remains relaxed.

Exact frame sequence from left to right:
1. The right hand reaches and touches the hair near the temple or upper side of the head, with the elbow bent and the fingers clearly attached.
2. The fingers and wrist shift slightly to complete the scratch while the head gives a tiny natural response, then the pose can loop back to frame 1.

Keep the hand connected to the arm and visibly in contact with the hair. Preserve the hairstyle silhouette as much as possible and do not expose bald patches or change hair length. Keep both feet on the same baseline, the torso centered, and character scale identical. Do not add scratch marks, motion arcs, question marks, floating hair, detached fingers, extra limbs, or other effects.
```

## 公共负面提示词

```text
wrong frame count, fewer poses, extra poses, duplicate pose, multiple rows,
vertical layout, mixed actions in one strip, wrong chronological order,
cropped figure, touching poses, overlapping poses, neighboring-slot overlap,
visible grid, frame border, labels, frame numbers, text, watermark, signature,
identity drift, different person, different face, different eye color,
different hairstyle, bangs, ponytail, hair-length change, head-size change,
body-proportion change, height change, inconsistent scale, horizontal body drift,
inconsistent baseline, missing limb, extra limb, detached hand, extra fingers,
outfit change, different suit color, missing shirt, missing tie,
changed plaid pattern, missing brooch, different brooch, moved brooch,
mirrored brooch, simplified brooch, extra accessory, handheld prop,
photorealistic, 3D render, flat vector, pixel art, anime screenshot,
white background, black background, transparent checkerboard, gradient green,
background scene, floor, horizon, furniture, cast shadow, contact shadow,
reflection, glow, aura, speed lines, motion arcs, motion blur, afterimage,
dust cloud, impact burst, floating symbol, detached decoration, green spill
```

## 统一验收标准

- 每张源图只包含对应动作，姿势数量与表格一致，并且从左到右按时间顺序排列。
- 人物的脸、发型、头身比、西装、领带、胸针和画风与已确认待机素材一致。
- 同组人物大小一致，躯干中心稳定，落地帧共用基线，没有非动作需要的左右滑动或上下跳动。
- 所有人物完整、互不接触、没有裁切，图片外边和姿势之间留有足够绿色空间。
- 背景是单一纯 `#00FF00`，没有地面、投影、文字、边框、动作线或漂浮装饰。
