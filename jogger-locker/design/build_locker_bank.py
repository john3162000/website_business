#!/usr/bin/env python3
"""
Draws the 30-door jogger locker bank as inline SVG (unfolded front elevation,
side section, floor plan) and fills the drawings into locker_bank_template.html:

  locker-bank.html           the page as published to Claude
  up-oval-locker-bank.html   stand-alone copy to save and open in a browser

The bank is a U that fills a 2 x 2 m spot: a back bar with the control column
and two legs of lockers facing an aisle that opens onto the walkway. The door
layout lives in FACES; change it and rerun. Units are millimetres.
Standard library only:  python3 build_locker_bank.py
"""

from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent

MODULE = 400          # column width, centre to centre
DEPTH = 620           # body depth, back panel to door face
PLINTH = 100          # recessed base with adjustable feet
DOOR_TOP = 1700       # top edge of the highest door
SIGN_TOP = 1850       # top of the lit sign band
CANOPY = 50           # roof slab, outdoor sites only
DOOR_SWING = 360      # door leaf width
LOT = 2000            # side of the square floor spot
PITCH = {"S": 160, "M": 320, "L": 640}

# Faces in the order you meet them walking in: the left leg from the entrance
# to the back, the back, then the right leg from the back to the entrance.
# Columns hold doors top to bottom; None is the control column. Every door
# hinges on the side toward the entrance.
FACES = [
    ("Left leg", ["MMMMM", "MMMMM", "SSSSML"]),
    ("Back", [None]),
    ("Right leg", ["SSLL", "MMMMM", "MMMMM"]),
]
COLUMNS = [col for _, cols in FACES for col in cols]
AISLE = LOT - 2 * DEPTH                  # aisle width, and the back face between the legs
LEG = MODULE * len(FACES[0][1])          # length of a leg's door face
FILLER = (AISLE - MODULE * len(FACES[1][1])) / 2   # plain panel each side of the control column
CANOPY_REACH = AISLE // 2                # roofs over facing legs meet over the aisle
FLOOR = 2000          # SVG y of the floor line in the elevation and section

for col in COLUMNS:
    assert col is None or sum(PITCH[s] for s in col) == DOOR_TOP - PLINTH, col
assert sum(len(c) for c in COLUMNS if c) == 30
assert len(FACES[0][1]) == len(FACES[2][1]), "both legs need the same number of columns"
assert DEPTH + LEG <= LOT, "a leg is longer than the spot"
assert FILLER >= 0, "the back face is narrower than its columns"
assert AISLE > 2 * DOOR_SWING, "facing doors would hit each other"


def bays():
    """Every bay of the unfolded elevation: (face index, x, width, column)."""
    out, x = [], 0
    for f, (_, cols) in enumerate(FACES):
        pad = FILLER if f == 1 else 0
        if pad:
            out.append((f, x, pad, "filler"))
            x += pad
        for col in cols:
            out.append((f, x, MODULE, col))
            x += MODULE
        if pad:
            out.append((f, x, pad, "filler"))
            x += pad
    return out


def face_spans():
    spans, x = [], 0
    for f, (name, cols) in enumerate(FACES):
        width = AISLE if f == 1 else MODULE * len(cols)
        spans.append((name, x, width))
        x += width
    return spans


WIDTH = sum(w for _, _, w in face_spans())   # all three faces laid flat


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
    spans = face_spans()
    words = ["LOCKERS  ·  4 HOURS", "PAY BY QR", "OVAL LOCKERS"]
    out.append(rect(-100, Y(SIGN_TOP + CANOPY), WIDTH + 200, CANOPY, "opt"))
    out.append(text(spans[0][2] / 2, Y(SIGN_TOP + CANOPY) - 24, "Roof, outdoor sites only", 52, "t", "middle"))
    out.append(rect(0, Y(SIGN_TOP), WIDTH, SIGN_TOP - PLINTH, "body"))
    out.append(rect(0, Y(SIGN_TOP), WIDTH, SIGN_TOP - DOOR_TOP, "sign"))
    sign_y = Y((SIGN_TOP + DOOR_TOP) / 2) + 23
    for (_, x0, w), word in zip(spans, words):
        out.append(text(x0 + w / 2, sign_y, word, 64 if w > 600 else 56, "sign-t", "middle"))
    out.append(rect(50, Y(PLINTH), WIDTH - 100, PLINTH, "plinth"))

    number = 0
    for _, x0, w, col in bays():
        if col == "filler":
            out.append(rect(x0, Y(DOOR_TOP), w, DOOR_TOP - PLINTH, "panel"))
            continue
        if col is None:
            out += control_column(x0)
            continue
        top = DOOR_TOP
        for size in col:
            number += 1
            h = PITCH[size]
            k = size.lower()
            small = h <= 200
            out.append(rect(x0 + 10, Y(top) + 5, MODULE - 20, h - 10, f"door door-{k}", rx=6))
            out.append(text(x0 + 38, Y(top) + (h / 2 + 22 if small else 72), str(number), 56 if small else 62, f"door-t-{k} b"))
            out.append(text(x0 + MODULE - 38, Y(top) + (h / 2 + 19 if small else 72), size, 48 if small else 52, f"door-t-{k}", "end"))
            top -= h
    edges = sorted({x0 for _, x0, _, _ in bays()} - {0})
    for x in edges:
        out.append(line(x, Y(DOOR_TOP), x, Y(PLINTH), "frame"))
    out.append(rect(0, Y(SIGN_TOP), WIDTH, SIGN_TOP - PLINTH, "outline"))
    for _, x0, _ in spans[1:]:
        out.append(line(x0, Y(SIGN_TOP + CANOPY) - 70, x0, FLOOR + 40, "fold"))
        out.append(text(x0, Y(SIGN_TOP + CANOPY) - 90, "Inside corner", 50, "t-strong", "middle"))
    out.append(rect(-200, FLOOR, WIDTH + 400, 45, fill="url(#hatchA)"))
    out.append(line(-200, FLOOR, WIDTH + 200, FLOOR, "floor"))

    for _, x0, w, _ in bays():
        out += hdim(x0, x0 + w, FLOOR + 95, f"{w:g}", size=46 if w >= MODULE else 40)
    for name, x0, w in spans:
        out += hdim(x0, x0 + w, FLOOR + 215, f"{name} {w:,}", ext_from=FLOOR, size=50)
    out += vdim(Y(PLINTH), Y(0), -150, "100", ext_from=0, size=46, side="right")
    out += vdim(Y(DOOR_TOP), Y(PLINTH), -150, "1,600", ext_from=0)
    out += vdim(Y(SIGN_TOP), Y(DOOR_TOP), -150, "150", ext_from=0, size=46, side="right")
    out += vdim(Y(SIGN_TOP), Y(0), -330, f"{SIGN_TOP:,}")
    marks = [PLINTH + i * PITCH["M"] for i in range(6)]
    for lo, hi in zip(marks, marks[1:]):
        out += vdim(Y(hi), Y(lo), WIDTH + 110, "320", ext_from=WIDTH, size=46, side="right")

    counts = door_counts()
    label = (f"Unfolded front elevation of the U-shaped locker bank, 1,850 mm tall: the left leg, the back and "
             f"the right leg drawn side by side. Each leg has three 400 mm columns; the back has the control "
             f"column with the touch screen, QR plate and service cabinet between two {FILLER:g} mm panels. "
             f"{counts.get('S', 0)} small, {counts.get('M', 0)} backpack and {counts.get('L', 0)} large doors, "
             f"with the small and large doors in the columns next to the back.")
    return svg(f"-440 -160 {WIDTH + 740} 2430", label, out)


def section():
    out = [hatch("hatchB")]
    reach = DEPTH + CANOPY_REACH
    out.append(rect(-100, Y(1980), 100, 1980, fill="url(#hatchB)"))
    out.append(line(0, Y(1980), 0, FLOOR, "wall-face"))
    out.append(tag("path", cls="opt",
                   d=f"M0,{num(Y(SIGN_TOP + CANOPY))} H{num(reach)} V{num(Y(SIGN_TOP) + 40)} "
                     f"H{num(reach - 20)} V{num(Y(SIGN_TOP))} H0 Z"))
    out.append(text(300, Y(SIGN_TOP + CANOPY) - 26, "Roof, outdoor only", 46, "t", "middle"))
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
             f"a roof reaching {CANOPY_REACH} mm over the aisle for outdoor sites, a recessed plinth and floor anchor bolts.")
    return svg("-140 -60 1420 2330", label, out)


def plan():
    """Top view of the U in the square spot: the back bar along the top
    (y = 0), the legs down the sides and the aisle opening at the bottom."""
    out = []
    xl, xr = DEPTH, LOT - DEPTH            # the aisle's walls, which are the legs' door faces
    end = DEPTH + LEG                      # where the legs stop
    out.append(rect(0, 0, LOT, LOT, "lot"))
    out.append(rect(xl, DEPTH, AISLE, LOT - DEPTH, "zone"))
    out.append(rect(0, 0, LOT, end + 100, "opt"))
    out.append(rect(0, 0, LOT, DEPTH, "body"))
    out.append(rect(0, DEPTH, DEPTH, LEG, "body"))
    out.append(rect(xr, DEPTH, DEPTH, LEG, "body"))
    out.append(rect(xl, 0, AISLE, DEPTH, "panel"))
    for x in (xl, xr):
        out.append(line(x, 0, x, DEPTH, "frame"))
    for x in (xl + FILLER, xr - FILLER):
        out.append(line(x, 0, x, DEPTH, "frame"))
    for k in range(1, len(FACES[0][1])):
        out.append(line(0, DEPTH + k * MODULE, DEPTH, DEPTH + k * MODULE, "frame"))
        out.append(line(xr, DEPTH + k * MODULE, LOT, DEPTH + k * MODULE, "frame"))
    out.append(line(0, DEPTH, DEPTH, DEPTH, "frame"))
    out.append(line(xr, DEPTH, LOT, DEPTH, "frame"))
    out.append(tag("path", cls="outline",
                   d=f"M0,0 H{num(LOT)} V{num(end)} H{num(xr)} V{num(DEPTH)} H{num(xl)} V{num(end)} H0 Z"))

    def name(col):
        if col is None:
            return ["Control", "screen"]
        return [", ".join(f"{col.count(sz)} {sz}" if col.count(sz) > 1 else sz for sz in "SML" if sz in col)]

    def label(cx, cy, rows):
        for i, row in enumerate(rows):
            out.append(text(cx, cy + 18 + (i - (len(rows) - 1) / 2) * 58, row, 48, "t-strong", "middle"))

    for cx in (DEPTH / 2, LOT - DEPTH / 2):
        label(cx, DEPTH / 2, ["Corner"])
    label(LOT / 2, DEPTH / 2, name(None))
    legs = [(FACES[0][1], 0, 1), (FACES[2][1], xr, -1)]
    for cols, x0, facing in legs:
        n = len(cols)
        for i, col in enumerate(cols):
            # The left leg reads from the entrance to the back, the right leg from the back out.
            row = n - 1 - i if facing == 1 else i
            y0 = DEPTH + row * MODULE
            label(x0 + DEPTH / 2, y0 + MODULE / 2, name(col))
            face = x0 + DEPTH if facing == 1 else x0
            hinge = y0 + MODULE - 20               # on the side toward the entrance
            tip = face + facing * DOOR_SWING
            out.append(line(face, hinge, tip, hinge, "leaf"))
            out.append(tag("path", cls="swing",
                           d=f"M{num(face)},{num(hinge - DOOR_SWING)} A{DOOR_SWING},{DOOR_SWING} 0 0 "
                             f"{1 if facing == 1 else 0} {num(tip)},{num(hinge)}"))
    hinge = LOT / 2 + MODULE / 2 - 20
    out.append(line(hinge, DEPTH, hinge, DEPTH + DOOR_SWING, "swing-opt"))
    out.append(tag("path", cls="swing-opt",
                   d=f"M{num(hinge - DOOR_SWING)},{num(DEPTH)} A{DOOR_SWING},{DOOR_SWING} 0 0 0 {num(hinge)},{num(DEPTH + DOOR_SWING)}"))

    out.append(text(LOT / 2, LOT + 95, "Entrance from the walkway", 46, "t-strong", "middle"))
    out += hdim(xl, xr, LOT + 230, f"{AISLE} aisle", ext_from=LOT, size=46)

    out += hdim(0, LOT, -250, f"{LOT:,} spot", ext_from=0, size=54)
    out += hdim(0, DEPTH, -110, f"{DEPTH}", ext_from=0, size=46)
    out += hdim(xl, xr, -110, f"{AISLE}", ext_from=0, size=46)
    out += hdim(xr, LOT, -110, f"{DEPTH}", ext_from=0, size=46)
    out += vdim(0, LOT, -380, f"{LOT:,} spot", ext_from=0)
    out += vdim(0, DEPTH, -200, f"{DEPTH}", ext_from=0, size=46)
    out += vdim(DEPTH, end, -200, f"{LEG:,}", ext_from=0, size=46)
    out += vdim(end, LOT, -200, f"{LOT - end}", ext_from=0, size=46)
    out += vdim(DEPTH, LOT, LOT + 160, f"{LOT - DEPTH:,}", ext_from=LOT, size=46, side="right")

    area = (LOT * DEPTH + 2 * DEPTH * LEG) / 1e6
    text_label = (f"Floor plan of the {LOT / 1000:.0f} by {LOT / 1000:.0f} metre spot. The locker bank is a U: a back "
                  f"bar across the full width with two corner blocks and the control column in the middle, and two "
                  f"legs of three columns facing each other across an aisle {AISLE} mm wide and {LOT - DEPTH:,} mm "
                  f"deep that opens onto the walkway. The lockers cover {area:.2f} square metres. Doors hinge on the "
                  f"side toward the entrance and swing {DOOR_SWING} mm into the aisle.")
    return svg(f"-520 -380 {LOT + 900} {LOT + 680}", text_label, out)


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
