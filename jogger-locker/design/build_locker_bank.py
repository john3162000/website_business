#!/usr/bin/env python3
"""
Draws the 30-door jogger locker bank as inline SVG (unfolded front elevation,
side section, floor plan) and fills the drawings into locker_bank_template.html:

  locker-bank.html           the page as published to Claude
  up-oval-locker-bank.html   stand-alone copy to save and open in a browser

The bank is an L that fits a 2 x 2 m spot: two wings of three columns joined
by a corner block. The door layout lives in COLUMNS and FOLD; change them and
rerun. Units are millimetres. Standard library only:  python3 build_locker_bank.py
"""

from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent

MODULE = 400          # column width, centre to centre
DEPTH = 620           # body depth, back panel to door face
PLINTH = 100          # recessed base with adjustable feet
DOOR_TOP = 1700       # top edge of the highest door
SIGN_TOP = 1850       # top of the lit sign band
CANOPY = 50           # canopy slab, outdoor sites only
CANOPY_REACH = 300    # canopy projection past the door face
USER_ZONE = 1000      # clear floor in front of the doors
DOOR_SWING = 360      # door leaf width
LOT = 2000            # side of the square floor spot
PITCH = {"S": 160, "M": 320, "L": 640}

# Columns in reading order as you face the doors, doors top to bottom; None is
# the control column. The first FOLD columns form the left wing, the rest the
# right wing, and the wings meet at a DEPTH x DEPTH corner block. Doors hinge on
# the side away from the corner.
COLUMNS = ["MMMMM", "SSMMMM", "SSSSMMM", None, "SSSSMMM", "MMMMM"]
FOLD = 3
WIDTH = MODULE * len(COLUMNS)            # both wings laid flat
WING_A = MODULE * FOLD                   # left wing door face
WING_B = MODULE * (len(COLUMNS) - FOLD)  # right wing door face
FLOOR = 2000          # SVG y of the floor line in the elevation and section

for col in COLUMNS:
    assert col is None or sum(PITCH[s] for s in col) == DOOR_TOP - PLINTH, col
assert sum(len(c) for c in COLUMNS if c) == 30
assert None in COLUMNS[FOLD:], "the control column belongs on the right wing"
assert DEPTH + max(WING_A, WING_B) <= LOT, "a wing is longer than the spot"
assert LOT - DEPTH - DOOR_SWING >= USER_ZONE, "not enough room to stand past an open door"


def door_counts():
    counts = {}
    for col in COLUMNS:
        for size in col or "":
            counts[size] = counts.get(size, 0) + 1
    return counts


def Y(height):
    """SVG y for a height above the floor."""
    return FLOOR - height


def num(v):
    return f"{v:g}"


def tag(name, text=None, **attrs):
    parts = []
    for key, value in attrs.items():
        if value is None:
            continue
        key = "class" if key == "cls" else key.replace("_", "-")
        parts.append(f'{key}="{escape(str(value), quote=True)}"')
    opening = f"<{name} {' '.join(parts)}"
    return f"{opening}/>" if text is None else f"{opening}>{escape(text)}</{name}>"


def rect(x, y, w, h, cls=None, rx=None, fill=None):
    return tag("rect", x=num(x), y=num(y), width=num(w), height=num(h), rx=rx, cls=cls, fill=fill)


def line(x1, y1, x2, y2, cls):
    return tag("line", x1=num(x1), y1=num(y1), x2=num(x2), y2=num(y2), cls=cls)


def text(x, y, s, size, cls="t", anchor="start", rotate=False):
    transform = f"rotate(-90 {num(x)} {num(y)})" if rotate else None
    return tag("text", s, x=num(x), y=num(y), font_size=size, text_anchor=anchor,
               cls=cls, transform=transform)


def hatch(pid):
    return (f'<defs><pattern id="{pid}" width="36" height="36" patternUnits="userSpaceOnUse" '
            f'patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="36" class="hatch"/>'
            f"</pattern></defs>")


TICK = 22


def hdim(x1, x2, y, label, ext_from=None, size=54):
    """Horizontal dimension line at y, optional extension lines from ext_from."""
    out = []
    if ext_from is not None:
        step = 1 if y > ext_from else -1
        for x in (x1, x2):
            out.append(line(x, ext_from + 15 * step, x, y + 25 * step, "dim"))
    out.append(line(x1, y, x2, y, "dim"))
    for x in (x1, x2):
        out.append(line(x - TICK, y + TICK, x + TICK, y - TICK, "dim tick"))
    out.append(text((x1 + x2) / 2, y - 18, label, size, "dim-t", "middle"))
    return out


def vdim(y1, y2, x, label, ext_from=None, size=54, side="left"):
    """Vertical dimension line at x from y1 to y2 (SVG coordinates)."""
    out = []
    if ext_from is not None:
        step = -1 if x < ext_from else 1
        for y in (y1, y2):
            out.append(line(ext_from + 15 * step, y, x + 25 * step, y, "dim"))
    out.append(line(x, y1, x, y2, "dim"))
    for y in (y1, y2):
        out.append(line(x - TICK, y + TICK, x + TICK, y - TICK, "dim tick"))
    mid = (y1 + y2) / 2
    if side == "left":
        out.append(text(x - 18, mid, label, size, "dim-t", "middle", rotate=True))
    else:
        out.append(text(x + 30, mid + size * 0.35, label, size, "dim-t"))
    return out


def svg(view_box, label, body):
    return (f'<svg viewBox="{view_box}" role="img" aria-label="{escape(label, quote=True)}" '
            f'xmlns="http://www.w3.org/2000/svg">' + "".join(body) + "</svg>")


def qr_glyph(x, y, size):
    u = size / 12
    out = []
    for fx, fy in ((0, 0), (8, 0), (0, 8)):
        out.append(rect(x + fx * u, y + fy * u, 4 * u, 4 * u, "qr"))
        out.append(rect(x + (fx + 1) * u, y + (fy + 1) * u, 2 * u, 2 * u, "qr-in"))
    for mx, my in ((5, 1), (6, 3), (5, 5), (7, 6), (9, 5), (10, 7), (6, 8), (8, 9), (10, 10), (5, 10), (9, 11)):
        out.append(rect(x + mx * u, y + my * u, u, u, "qr"))
    return out


def control_column(x0):
    cx = x0 + MODULE / 2
    out = [rect(x0, Y(DOOR_TOP), MODULE, DOOR_TOP - PLINTH, "panel")]
    out.append(rect(cx - 155, Y(1500), 310, 350, "housing", rx=16))
    out.append(rect(cx - 130, Y(1475), 260, 300, "screen", rx=6))
    out.append(text(cx, Y(1350), "Touch", 56, "screen-t", "middle"))
    out.append(text(cx, Y(1285), "screen", 56, "screen-t", "middle"))
    out.append(rect(cx - 155, Y(1100), 310, 200, "plate", rx=10))
    out += qr_glyph(cx - 60, Y(1085), 120)
    out.append(text(cx, Y(915), "Pay by QR", 48, "t-strong", "middle"))
    out.append(rect(x0 + 10, Y(850), MODULE - 20, 850 - PLINTH - 5, "service", rx=6))
    out.append(text(cx, Y(530), "Service", 54, "t-strong", "middle"))
    out.append(text(cx, Y(465), "cabinet", 54, "t-strong", "middle"))
    out.append(tag("circle", cx=num(x0 + MODULE - 50), cy=num(Y(480)), r=14, cls="key"))
    return out


def elevation():
    out = [hatch("hatchA")]
    fold_x = FOLD * MODULE
    out.append(rect(-100, Y(SIGN_TOP + CANOPY), WIDTH + 200, CANOPY, "opt"))
    out.append(text(fold_x / 2, Y(SIGN_TOP + CANOPY) - 24, "Canopy, outdoor sites only", 52, "t", "middle"))
    out.append(rect(0, Y(SIGN_TOP), WIDTH, SIGN_TOP - PLINTH, "body"))
    out.append(rect(0, Y(SIGN_TOP), WIDTH, SIGN_TOP - DOOR_TOP, "sign"))
    sign_y = Y((SIGN_TOP + DOOR_TOP) / 2) + 23
    out.append(text(fold_x / 2, sign_y, "LOCKERS  ·  4 HOURS", 64, "sign-t", "middle"))
    out.append(text((fold_x + WIDTH) / 2, sign_y, "PAY BY QR", 64, "sign-t", "middle"))
    out.append(rect(50, Y(PLINTH), WIDTH - 100, PLINTH, "plinth"))

    number = 0
    for c, col in enumerate(COLUMNS):
        x0 = c * MODULE
        if col is None:
            out += control_column(x0)
            continue
        top = DOOR_TOP
        for size in col:
            number += 1
            h = PITCH[size]
            k = size.lower()
            out.append(rect(x0 + 10, Y(top) + 5, MODULE - 20, h - 10, f"door door-{k}", rx=6))
            out.append(text(x0 + 38, Y(top) + 72 if h > 200 else Y(top) + h / 2 + 22, str(number), 62 if h > 200 else 56, f"door-t-{k} b"))
            out.append(text(x0 + MODULE - 38, Y(top) + 72 if h > 200 else Y(top) + h / 2 + 19, size, 52 if h > 200 else 48, f"door-t-{k}", "end"))
            top -= h
    for c in range(1, len(COLUMNS)):
        out.append(line(c * MODULE, Y(DOOR_TOP), c * MODULE, Y(PLINTH), "frame"))
    out.append(rect(0, Y(SIGN_TOP), WIDTH, SIGN_TOP - PLINTH, "outline"))
    out.append(line(fold_x, Y(SIGN_TOP + CANOPY) - 70, fold_x, FLOOR + 40, "fold"))
    out.append(text(fold_x, Y(SIGN_TOP + CANOPY) - 90, "Inner corner", 50, "t-strong", "middle"))
    out.append(rect(-200, FLOOR, WIDTH + 400, 45, fill="url(#hatchA)"))
    out.append(line(-200, FLOOR, WIDTH + 200, FLOOR, "floor"))

    for c in range(len(COLUMNS)):
        out += hdim(c * MODULE, (c + 1) * MODULE, FLOOR + 95, "400", size=46)
    out += hdim(0, fold_x, FLOOR + 215, f"Left wing {WING_A:,}", ext_from=FLOOR, size=52)
    out += hdim(fold_x, WIDTH, FLOOR + 215, f"Right wing {WING_B:,}", ext_from=FLOOR, size=52)
    out += vdim(Y(PLINTH), Y(0), -150, "100", ext_from=0, size=46, side="right")
    out += vdim(Y(DOOR_TOP), Y(PLINTH), -150, "1,600", ext_from=0)
    out += vdim(Y(SIGN_TOP), Y(DOOR_TOP), -150, "150", ext_from=0, size=46, side="right")
    out += vdim(Y(SIGN_TOP), Y(0), -330, f"{SIGN_TOP:,}")
    marks = [PLINTH + i * PITCH["M"] for i in range(6)]
    for lo, hi in zip(marks, marks[1:]):
        out += vdim(Y(hi), Y(lo), WIDTH + 110, "320", ext_from=WIDTH, size=46, side="right")

    counts = door_counts()
    label = (f"Unfolded front elevation of the L-shaped locker bank: six 400 mm columns, three on each wing, "
             f"1,850 mm tall. {counts.get('S', 0)} small doors sit high in the columns on either side of the "
             f"inner corner, {counts.get('M', 0)} backpack doors fill the rest, and the first column of the right "
             f"wing holds the touch screen, QR payment plate and service cabinet.")
    return svg(f"-440 -160 {WIDTH + 740} 2430", label, out)


def section():
    out = [hatch("hatchB")]
    reach = DEPTH + CANOPY_REACH
    out.append(rect(-100, Y(1980), 100, 1980, fill="url(#hatchB)"))
    out.append(line(0, Y(1980), 0, FLOOR, "wall-face"))
    out.append(tag("path", cls="opt",
                   d=f"M0,{num(Y(SIGN_TOP + CANOPY))} H{num(reach)} V{num(Y(SIGN_TOP) + 40)} "
                     f"H{num(reach - 20)} V{num(Y(SIGN_TOP))} H0 Z"))
    out.append(text(300, Y(SIGN_TOP + CANOPY) - 26, "Canopy, outdoor only", 46, "t", "middle"))
    out.append(rect(0, Y(SIGN_TOP), DEPTH, SIGN_TOP - DOOR_TOP, "sign"))
    out.append(rect(0, Y(DOOR_TOP), DEPTH, DOOR_TOP - PLINTH, "body"))
    out.append(rect(20, Y(DOOR_TOP), 30, DOOR_TOP - PLINTH, "panel"))
    shelves = [PLINTH + i * PITCH["M"] for i in range(5)]
    for h in shelves:
        top = h + PITCH["M"]
        out.append(rect(50, Y(top), 550, top - (h + 20), "interior"))
        out.append(rect(DEPTH - 20, Y(top) + 4, 20, PITCH["M"] - 8, "door door-m"))
    out.append(rect(90, Y(440 + 220), 480, 220, "bag", rx=60))
    out.append(text(330, Y(440 + 110) + 17, "Backpack", 50, "bag-t", "middle"))
    out.append(rect(0, Y(PLINTH), DEPTH - 50, PLINTH, "plinth"))
    out.append(rect(0, Y(SIGN_TOP), DEPTH, SIGN_TOP - PLINTH, "outline"))
    out.append(line(280, Y(PLINTH) - 10, 280, FLOOR + 60, "bolt"))
    out.append(rect(-100, FLOOR, reach + 440, 45, fill="url(#hatchB)"))
    out.append(line(-100, FLOOR, reach + 340, FLOOR, "floor"))

    out.append(text(DEPTH + 40, Y((SIGN_TOP + DOOR_TOP) / 2) + 17, "Lit sign band", 46))
    out.append(text(DEPTH + 40, Y(1640), "Vent slots at top", 46))
    out.append(text(DEPTH + 40, Y(1580), "and bottom of doors", 46))
    out.append(text(DEPTH + 40, Y(1300), "Door, 1.0 mm steel", 46))
    out.append(text(DEPTH + 40, Y(70), "Recessed plinth,", 44))
    out.append(text(DEPTH + 40, Y(15), "adjustable feet", 44))
    out.append(text(310, FLOOR + 115, "Floor anchor bolts", 44))

    out += hdim(DEPTH, reach, Y(SIGN_TOP + CANOPY) - 70, f"{CANOPY_REACH}", ext_from=Y(SIGN_TOP + CANOPY), size=46)
    out += hdim(50, 600, Y(250), "550 clear", size=46)
    out += vdim(Y(1060), Y(760), DEPTH + 90, "300 clear", ext_from=DEPTH, size=46, side="right")
    out += hdim(0, DEPTH, FLOOR + 225, f"{DEPTH}", ext_from=FLOOR, size=54)

    label = ("Side section through a backpack column, 620 mm deep: five compartments each 300 mm high "
             "and 550 mm deep inside, a 480 by 220 mm backpack lying flat in the second compartment, "
             "a 300 mm canopy for outdoor sites, a recessed plinth and floor anchor bolts.")
    return svg("-140 -60 1420 2330", label, out)


def plan():
    """Top view of the L in the square spot. The back of the right wing is at the
    top (y = 0) and the back of the left wing on the left (x = 0)."""
    out = []
    ctrl = COLUMNS.index(None)
    far = LOT - DEPTH                      # clear floor from a door face to the open side
    out.append(rect(0, 0, LOT, LOT, "lot"))
    out.append(rect(DEPTH, DEPTH, far, far, "zone"))
    reach = DEPTH + CANOPY_REACH
    out.append(tag("path", cls="opt",
                   d=f"M0,0 H{num(DEPTH + WING_B + 100)} V{num(reach)} H{num(reach)} "
                     f"V{num(DEPTH + WING_A + 100)} H0 Z"))
    out.append(rect(0, 0, DEPTH, DEPTH, "body"))
    out.append(rect(0, DEPTH, DEPTH, WING_A, "body"))
    out.append(rect(DEPTH, 0, WING_B, DEPTH, "body"))
    out.append(rect(DEPTH + (ctrl - FOLD) * MODULE, 0, MODULE, DEPTH, "panel"))
    for k in range(1, FOLD):
        out.append(line(0, DEPTH + k * MODULE, DEPTH, DEPTH + k * MODULE, "frame"))
    for k in range(1, len(COLUMNS) - FOLD):
        out.append(line(DEPTH + k * MODULE, 0, DEPTH + k * MODULE, DEPTH, "frame"))
    out.append(line(DEPTH, 0, DEPTH, DEPTH, "frame"))
    out.append(line(0, DEPTH, DEPTH, DEPTH, "frame"))
    out.append(tag("path", cls="outline",
                   d=f"M0,0 H{num(DEPTH + WING_B)} V{num(DEPTH)} H{num(DEPTH)} V{num(DEPTH + WING_A)} H0 Z"))

    def name(col):
        if col is None:
            return ["Control", "screen"]
        counts = [f"{col.count(sz)} {sz}" if col.count(sz) > 1 else sz for sz in "SML" if sz in col]
        return [", ".join(counts)]

    out.append(text(DEPTH / 2, DEPTH / 2 - 8, "Corner", 46, "t", "middle"))
    out.append(text(DEPTH / 2, DEPTH / 2 + 50, "block", 46, "t", "middle"))
    for c, col in enumerate(COLUMNS):
        if c < FOLD:                       # left wing, reading order runs toward the corner
            y0 = DEPTH + (FOLD - 1 - c) * MODULE
            cx, cy = DEPTH / 2, y0 + MODULE / 2
            hinge = y0 + MODULE - 20       # hinge on the side away from the corner
            out.append(line(DEPTH, hinge, DEPTH + DOOR_SWING, hinge, "leaf"))
            out.append(tag("path", cls="swing",
                           d=f"M{num(DEPTH)},{num(hinge - DOOR_SWING)} A{DOOR_SWING},{DOOR_SWING} 0 0 1 "
                             f"{num(DEPTH + DOOR_SWING)},{num(hinge)}"))
        else:                              # right wing, reading order runs away from the corner
            x0 = DEPTH + (c - FOLD) * MODULE
            cx, cy = x0 + MODULE / 2, DEPTH / 2
            hinge = x0 + MODULE - 20
            cls = "leaf" if col else "swing-opt"
            out.append(line(hinge, DEPTH, hinge, DEPTH + DOOR_SWING, cls))
            out.append(tag("path", cls="swing" if col else "swing-opt",
                           d=f"M{num(hinge - DOOR_SWING)},{num(DEPTH)} A{DOOR_SWING},{DOOR_SWING} 0 0 0 "
                             f"{num(hinge)},{num(DEPTH + DOOR_SWING)}"))
        rows = name(col)
        for i, row in enumerate(rows):
            out.append(text(cx, cy + 18 + (i - (len(rows) - 1) / 2) * 58, row, 48, "t-strong", "middle"))

    mid = DEPTH + far / 2
    out.append(text(mid + 110, mid - 30, "Standing area", 58, "t-strong", "middle"))
    out.append(text(mid + 110, mid + 45, f"{far / 1000:.2f} × {far / 1000:.2f} m", 52, "t", "middle"))
    out.append(text(mid + 110, mid + 115, f"{far - DOOR_SWING:,} mm clear past an open door", 44, "t", "middle"))
    out.append(text(LOT / 2 + DEPTH / 2, LOT + 95, "Open side", 46, "t", "middle"))
    out.append(text(LOT + 95, LOT / 2 + DEPTH / 2, "Open side", 46, "t", "middle", rotate=True))

    out += hdim(0, LOT, -250, f"{LOT:,} spot", ext_from=0, size=54)
    out += hdim(0, DEPTH, -110, f"{DEPTH}", ext_from=0, size=46)
    out += hdim(DEPTH, DEPTH + WING_B, -110, f"{WING_B:,}", ext_from=0, size=46)
    out += hdim(DEPTH + WING_B, LOT, -110, f"{LOT - DEPTH - WING_B}", ext_from=0, size=46)
    out += vdim(0, LOT, -380, f"{LOT:,} spot", ext_from=0)
    out += vdim(0, DEPTH, -200, f"{DEPTH}", ext_from=0, size=46)
    out += vdim(DEPTH, DEPTH + WING_A, -200, f"{WING_A:,}", ext_from=0, size=46)
    out += vdim(DEPTH + WING_A, LOT, -200, f"{LOT - DEPTH - WING_A}", ext_from=0, size=46)
    out += hdim(DEPTH, LOT, LOT + 230, f"{far:,}", ext_from=LOT, size=50)

    unit = (DEPTH * DEPTH + DEPTH * (WING_A + WING_B)) / 1e6
    label = (f"Floor plan of the {LOT / 1000:.0f} by {LOT / 1000:.0f} metre spot. The locker bank is an L along two "
             f"sides: a corner block, a left wing of three columns facing right and a right wing of three columns "
             f"facing down, covering {unit:.2f} square metres. Doors hinge on the side away from the corner and "
             f"swing {DOOR_SWING} mm into a {far / 1000:.2f} metre square standing area that opens onto the walkway "
             f"on the two open sides. The control column with the screen is next to the inner corner.")
    return svg(f"-520 -380 {LOT + 760} {LOT + 760}", label, out)


def main():
    template = (HERE / "locker_bank_template.html").read_text(encoding="utf-8")
    page = (template.replace("{{ELEVATION}}", elevation())
                    .replace("{{SECTION}}", section())
                    .replace("{{PLAN}}", plan())
                    .replace("{{ELEV_W}}", str(WIDTH + 740)))
    assert "{{" not in page
    (HERE / "locker-bank.html").write_text(page, encoding="utf-8")
    body_start = page.index('<main class="page">')
    standalone = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                  + page[:body_start] + "</head>\n<body>\n" + page[body_start:] + "\n</body>\n</html>\n")
    (HERE / "up-oval-locker-bank.html").write_text(standalone, encoding="utf-8")
    print("wrote locker-bank.html and up-oval-locker-bank.html")


if __name__ == "__main__":
    main()
