#!/usr/bin/env python3
"""Process border-collie source art into transparent sprite frames.

Pipeline per source image:
  1. downscale 2048 -> 512 (fast, and 480px output barely needs more)
  2. erase the gray AI watermark in the bottom-right corner
  3. remove the white background via edge flood fill (keeps white fur)
Per action group:
  4. union the alpha bbox across all frames (stable size within an action)
  5. bottom-anchor onto a 480x480 transparent canvas (feet stay on the ground)

Run:  python tools/process_assets.py
"""
import os
from collections import deque

from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "..", "png")
OUT = os.path.join(BASE, "..", "src", "assets")
ICON = os.path.join(BASE, "..", "src-tauri", "app-icon.png")
WORK = 512      # working size after downscale
CANVAS = 480    # output frame size (240 CSS px @2x retina)
TOL = 30        # flood-fill white tolerance

# action -> output frame name prefix; source matched by substring
ACTIONS = ["idle", "walk_right", "run_right", "head_tilt", "sit", "lying", "sleep"]
NAME_MAP = {"walk_right": "walk", "run_right": "run", "head_tilt": "happy"}


def normalize_names():
    """Source filenames contain literal backslashes; map clean name -> real name."""
    table = {}
    for f in os.listdir(SRC):
        table[f.replace("\\", "").replace("_", "")] = f
    return table


def find_sources(table, action):
    key = action.replace("_", "")
    hits = sorted(orig for norm, orig in table.items() if key in norm)
    if not hits:
        raise SystemExit(f"no source found for action: {action}")
    return hits


def erase_watermark(im):
    """Gray watermark text in the bottom-right corner -> paint back to white.

    Only touches near-gray pixels, so black outlines / white fur / pink glow
    are untouched even if the dog overlaps the corner.
    """
    w, h = im.size
    x0, y0 = int(w * 0.78), int(h * 0.86)
    px = im.load()
    for y in range(y0, h):
        for x in range(x0, w):
            r, g, b = px[x, y]
            hi, lo = max(r, g, b), min(r, g, b)
            if hi - lo < 18 and 100 < hi < 250:
                px[x, y] = (255, 255, 255)
    return im


def key_white(im, tol=TOL):
    """Flood-fill near-white from all borders; everything else keeps its alpha."""
    w, h = im.size
    px = im.load()
    mask = bytearray(w * h)  # 1 = background
    dq = deque()

    def is_bg(x, y):
        r, g, b = px[x, y]
        return r > 255 - tol and g > 255 - tol and b > 255 - tol

    for x in range(w):
        for y in (0, h - 1):
            if not mask[y * w + x] and is_bg(x, y):
                mask[y * w + x] = 1
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not mask[y * w + x] and is_bg(x, y):
                mask[y * w + x] = 1
                dq.append((x, y))

    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not mask[ny * w + nx] and is_bg(nx, ny):
                mask[ny * w + nx] = 1
                dq.append((nx, ny))

    out = im.convert("RGBA")
    po = out.load()
    for y in range(h):
        for x in range(w):
            if mask[y * w + x]:
                r, g, b, _ = po[x, y]
                po[x, y] = (r, g, b, 0)
    return out


def load_frame(path):
    im = Image.open(path).convert("RGB").resize((WORK, WORK), Image.LANCZOS)
    return key_white(erase_watermark(im))


def union_bbox(imgs):
    box = None
    for im in imgs:
        b = im.split()[3].getbbox()
        if not b:
            continue
        box = b if box is None else (
            min(box[0], b[0]), min(box[1], b[1]),
            max(box[2], b[2]), max(box[3], b[3]))
    return box


def render_group(frames):
    imgs = [load_frame(f) for f in frames]
    box = union_bbox(imgs)
    bw, bh = box[2] - box[0], box[3] - box[1]
    scale = min(CANVAS / bw, CANVAS / bh) * 0.96
    nw, nh = max(1, int(bw * scale)), max(1, int(bh * scale))
    out = []
    for im in imgs:
        crop = im.crop(box).resize((nw, nh), Image.LANCZOS)
        canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.alpha_composite(crop, ((CANVAS - nw) // 2, CANVAS - nh))
        out.append(canvas)
    return out


def make_icon(idle_canvas):
    icon = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    d = ImageDraw.Draw(icon)
    d.rounded_rectangle([0, 0, 1023, 1023], radius=220, fill=(255, 255, 255, 255))
    dog = idle_canvas.resize((880, 880), Image.LANCZOS)
    icon.alpha_composite(dog, (72, 72))
    icon.save(ICON)


def main():
    os.makedirs(OUT, exist_ok=True)
    table = normalize_names()
    idle_first = None
    for action in ACTIONS:
        frames = [os.path.join(SRC, f) for f in find_sources(table, action)]
        prefix = NAME_MAP.get(action, action)
        for i, canvas in enumerate(render_group(frames)):
            canvas.save(os.path.join(OUT, f"{prefix}_{i}.png"))
            if prefix == "idle" and i == 0:
                idle_first = canvas
        print(f"{action}: {len(frames)} frame(s) -> {prefix}_*.png")
    make_icon(idle_first)
    print("icon:", ICON)


if __name__ == "__main__":
    main()
