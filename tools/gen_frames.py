#!/usr/bin/env python3
"""Generate placeholder sprite frames (line-dog style) and the app icon.

All drawing happens in a 200x200 logical space, rendered at Sx
supersampling and downscaled for anti-aliasing.
Run:  python tools/gen_frames.py
"""
import math
import os

from PIL import Image, ImageDraw

BLACK = (35, 35, 35, 255)
WHITE = (255, 255, 255, 255)
SIZE = 200

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(BASE_DIR, "..", "src", "assets"))
ICON = os.path.normpath(os.path.join(BASE_DIR, "..", "src-tauri", "app-icon.png"))


def draw_dog(S, legs=(0, 0, 0, 0), dy=0, eye="open", tail="mid",
             ear="up", leg_len=23, stretch=0):
    """Draw the dog at 200*S px and return an RGBA image."""
    img = Image.new("RGBA", (SIZE * S, SIZE * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ow = max(2, int(2.4 * S))  # outline width
    lw = max(2, int(2.8 * S))  # leg width

    # tail (behind body)
    tail_tips = {"up": (40, 84), "mid": (42, 95), "down": (47, 140)}
    tx, ty = tail_tips[tail]
    pts = [(57, 118 + dy), (48, 106 + dy), (tx, ty + dy)]
    d.line([(x * S, y * S) for x, y in pts], fill=BLACK, width=lw, joint="curve")

    # legs (behind body so the tops are hidden)
    top_y = (148 + dy) * S
    bot_y = top_y + leg_len * S
    for x, off in zip((75, 95, 120, 140), legs):
        xt, xb = x * S, (x + off) * S
        d.line([xt, top_y, xb, bot_y], fill=BLACK, width=lw)
        d.line([xb - 4 * S, bot_y, xb + 4 * S, bot_y], fill=BLACK, width=lw)

    # body
    bb = (55, 95 + dy - stretch // 2, 145, 155 + dy + stretch // 2)
    d.ellipse([v * S for v in bb], fill=WHITE, outline=BLACK, width=ow)

    # head
    hb = (120, 70 + dy, 170, 120 + dy)
    d.ellipse([v * S for v in hb], fill=WHITE, outline=BLACK, width=ow)

    # ear
    eb = (124, 52 + dy, 139, 80 + dy) if ear == "up" else (126, 58 + dy, 140, 88 + dy)
    d.ellipse([v * S for v in eb], fill=WHITE, outline=BLACK, width=ow)

    # eye
    ex, ey = 153 * S, (91 + dy) * S
    if eye == "open":
        r = 3.6 * S
        d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=BLACK)
    elif eye == "closed":
        d.line([ex - 4 * S, ey, ex + 4 * S, ey], fill=BLACK, width=ow)
    else:  # happy, an upward arch
        r = 5 * S
        d.arc([ex - r, ey - r, ex + r, ey + r], start=180, end=360,
              fill=BLACK, width=ow)

    # nose
    nb = (164, 98 + dy, 172, 104 + dy)
    d.ellipse([v * S for v in nb], fill=BLACK)

    # mouth
    mb = (158, 100 + dy, 170, 112 + dy)
    d.arc([v * S for v in mb], start=10, end=170, fill=BLACK, width=ow)

    return img


def save(img, name):
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(os.path.join(ASSETS, name))


def main():
    os.makedirs(ASSETS, exist_ok=True)

    # idle: standing / blink
    save(draw_dog(2), "idle_0.png")
    save(draw_dog(2, eye="closed"), "idle_1.png")

    # walk: 4-frame diagonal gait, tail wagging
    A = 8
    for i in range(4):
        p = i * math.pi / 2
        o = round(A * math.sin(p))
        save(draw_dog(2, legs=(o, -o, -o, o), dy=-2 if i % 2 else 0,
                      tail="up" if i % 2 else "mid"), f"walk_{i}.png")

    # drag: picked up, legs dangle, ears and tail droop
    save(draw_dog(2, legs=(-2, -1, 1, 2), leg_len=26, tail="down",
                  ear="down", dy=2, stretch=4), "drag_0.png")

    # happy: jump and land
    save(draw_dog(2, legs=(-5, -2, 2, 5), leg_len=14, dy=-15,
                  eye="happy", tail="up"), "happy_0.png")
    save(draw_dog(2, legs=(3, -3, -3, 3), dy=-2, tail="up"), "happy_1.png")

    # app icon: dog on a white rounded square
    icon = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    d = ImageDraw.Draw(icon)
    d.rounded_rectangle([0, 0, 1023, 1023], radius=220, fill=WHITE)
    icon.alpha_composite(draw_dog(4, dy=-10), (112, 112))
    icon.save(ICON)

    print("frames:", sorted(os.listdir(ASSETS)))
    print("icon:", ICON)


if __name__ == "__main__":
    main()
