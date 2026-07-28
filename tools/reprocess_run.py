#!/usr/bin/env python3
"""Re-process just the run frames with the existing pipeline.

Pipeline matches tools/process_assets.py:
  downscale -> erase watermark -> edge flood-fill key -> trim + bottom-anchor
But operates only on run_0..3.png so other actions stay untouched.
"""
import os
from collections import deque

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "src", "assets"))
WORK = 512
CANVAS = 480
TOL = 30


def erase_watermark(im):
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
    w, h = im.size
    px = im.load()
    mask = bytearray(w * h)
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


def strip_pink_halo(im):
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 255 and r > b + 15 and r > g + 5:
                px[x, y] = (r, g, b, 0)
    return im


def load_frame(path):
    im = Image.open(path).convert("RGB").resize((WORK, WORK), Image.LANCZOS)
    return strip_pink_halo(key_white(erase_watermark(im)))


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


def render(frames):
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


def main():
    frames = []
    for i in range(4):
        p = os.path.join(ASSETS, f"run_{i}.png")
        if not os.path.exists(p):
            raise SystemExit(f"missing: {p}")
        frames.append(p)
    canvases = render(frames)
    for i, c in enumerate(canvases):
        c.save(os.path.join(ASSETS, f"run_{i}.png"))
    print("reprocessed:", [f"run_{i}.png" for i in range(4)])


if __name__ == "__main__":
    main()