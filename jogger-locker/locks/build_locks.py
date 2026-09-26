#!/usr/bin/env python3
"""
Draws the locker lock diagrams as inline SVG (how the latch opens and relocks,
how 30 locks are powered and controlled) and fills them into
locks_template.html:

  locker-locks.html           the page as published to Claude
  up-oval-locker-locks.html   stand-alone copy to save and open in a browser

Standard library only:  python3 build_locks.py
"""

from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent


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


def label(x, y, s, cls="lbl", anchor="middle", size=14):
    return tag("text", s, x=num(x), y=num(y), cls=cls, text_anchor=anchor, font_size=size)


def markers(prefix):
    head = ('viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" '
            'markerUnits="userSpaceOnUse" orient="auto-start-reverse"')
    return f'<defs><marker id="{prefix}-ah" {head}><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker></defs>'


def arrow(prefix, points, both=False):
    d = "M" + " L".join(f"{num(x)},{num(y)}" for x, y in points)
    marker = f"url(#{prefix}-ah)"
    return tag("path", d=d, cls="ln", marker_end=marker, marker_start=marker if both else None)


def box(x, y, w, h, title, lines=(), cls="box", title_size=15, line_size=13):
    out = [tag("rect", x=num(x), y=num(y), width=num(w), height=num(h), rx=8, cls=cls)]
    block = title_size + len(lines) * (line_size + 6)
    baseline = y + (h - block) / 2 + title_size * 0.8
    out.append(label(x + w / 2, baseline, title, "box-t", "middle", title_size))
    for line in lines:
        baseline += line_size + 6
        out.append(label(x + w / 2, baseline, line, "box-s", "middle", line_size))
    return out


def svg(width, height, aria, parts):
    return (f'<svg viewBox="0 0 {num(width)} {num(height)}" role="img" '
            f'aria-label="{escape(aria, quote=True)}" xmlns="http://www.w3.org/2000/svg">'
            + "".join(parts) + "</svg>")


def zigzag(x1, x2, y, turns, amp=7):
    step = (x2 - x1) / (turns * 2)
    pts = [(x1, y)] + [(x1 + i * step, y + (amp if i % 2 else -amp)) for i in range(1, turns * 2)] + [(x2, y)]
    return "M" + " L".join(f"{num(x)},{num(y)}" for x, y in pts)


# ---------------------------------------------------------------- L-01

PANEL_W, PANEL_GAP = 390, 15
# title, readout, bolt lift, door travel, coil on, switch pressed, door motion
PANELS = [
    ("1. Locked, no power", "Switch reads: locked", 0, 0, False, True, None),
    ("2. A 12 V pulse opens it", "12 V for under a second", 30, 45, True, False, "out"),
    ("3. Push the door shut", "Relocks by itself, no power", 12, 40, False, False, "in"),
]


def lock_panel(ox, title, readout, lift, travel, coil_on, pressed, motion):
    def X(x):
        return ox + x

    s = travel
    out = [tag("rect", x=num(ox), y=0, width=PANEL_W, height=390, rx=10, cls="panel")]
    out.append(label(X(PANEL_W / 2), 26, title, "panel-t", "middle", 15))

    # Lock body on the frame; the outline has a gap where the hook slides in.
    out.append(tag("rect", x=num(X(20)), y=60, width=220, height=230, rx=10, cls="housing"))
    out.append(tag("path", d=f"M{num(X(240))},224 V60 H{num(X(20))} V290 H{num(X(240))} V262", cls="outline"))
    out.append(label(X(130), 52, "lock body", "part", "middle", 13))

    # Bolt with a slanted tip, drawn before the coil so its top slides into it.
    bolt = [(130, 135), (160, 135), (160, 222), (142, 240), (130, 240)]
    out.append(tag("polygon", cls="bolt",
                   points=" ".join(f"{num(X(x))},{num(y - lift)}" for x, y in bolt)))
    out.append(label(X(122), 190 - lift, "bolt", "part", "end", 13))
    out.append(tag("rect", x=num(X(100)), y=75, width=90, height=60, rx=6, cls="coil on" if coil_on else "coil"))
    out.append(label(X(145), 110, "12 V" if coil_on else "coil", "coil-t on" if coil_on else "coil-t", "middle", 13))

    # Steel hook fixed to the door, with the notch the bolt drops into.
    out.append(tag("path", cls="hook",
                   d=(f"M{num(X(70 + s))},228 H{num(X(128 + s))} V242 H{num(X(162 + s))} V228 "
                      f"H{num(X(300 + s))} V258 H{num(X(70 + s))} Z")))
    out.append(label(X(270 + s), 218, "hook", "part", "middle", 13))
    out.append(tag("rect", x=num(X(300 + s)), y=30, width=25, height=300, rx=3, cls="door"))
    out.append(label(X(312 + s), 348, "door", "part", "middle", 13))

    # Door switch at the end of the slot; the hook presses its lever when fully in.
    out.append(tag("rect", x=num(X(30)), y=233, width=22, height=20, rx=3, cls="switch"))
    end = (X(70), 240) if pressed else (X(66), 226)
    out.append(tag("line", x1=num(X(52)), y1=238, x2=num(end[0]), y2=num(end[1]), cls="lever"))
    out.append(label(X(60), 282, "door switch", "part", "start", 12))

    # Pop-out spring between a bracket on the frame and the door.
    out.append(tag("line", x1=num(X(250)), y1=295, x2=num(X(250)), y2=315, cls="outline"))
    out.append(tag("path", d=zigzag(X(250), X(300 + s), 305, 5 if s < 20 else 7), cls="spring"))
    out.append(label(X(244), 322, "pop-out spring", "part", "end", 12))

    if motion == "out":
        out.append(arrow("m", [(X(252), 196), (X(292), 196)]))
        out.append(arrow("m", [(X(176), 212), (X(176), 170)]))
    elif motion == "in":
        out.append(arrow("m", [(X(335), 196), (X(290), 196)]))
    out.append(label(X(PANEL_W / 2), 376, readout, "readout", "middle", 14))
    return out


def mechanism():
    out = [markers("m")]
    for i, panel in enumerate(PANELS):
        out += lock_panel(i * (PANEL_W + PANEL_GAP), *panel)
    width = len(PANELS) * PANEL_W + (len(PANELS) - 1) * PANEL_GAP
    aria = ("How the lock works, in three panels. Locked: a spring holds the bolt in the notch of the door's "
            "hook, the coil has no power and the door switch reads locked. Opening: a 12 volt pulse through the "
            "coil pulls the bolt up and the pop-out spring pushes the door open. Closing: pushing the door slides "
            "the hook under the bolt's slanted tip until the bolt drops into the notch and the door is locked again "
            "without power.")
    return svg(width, 390, aria, out)


# ---------------------------------------------------------------- L-02

def wiring():
    p = "w"
    out = [markers(p)]
    out += box(20, 30, 170, 56, "Wall outlet", ["220 V"])
    out += box(20, 130, 170, 56, "Power supply", ["12 V, 10 A"])
    out += box(20, 230, 170, 70, "12 V UPS", ["LiFePO4 battery"])
    out.append(arrow(p, [(105, 86), (105, 130)]))
    out.append(label(113, 112, "AC", "lbl", "start", 13))
    out.append(arrow(p, [(105, 186), (105, 230)]))
    out.append(label(113, 212, "12 V", "lbl", "start", 13))

    # 12 V bus from the UPS to the Pi's converter and both lock boards.
    out.append(tag("path", d="M190,265 H250 V45 H520 V385", cls="bus"))
    out.append(label(385, 36, "12 V bus", "lbl", "middle", 13))
    out.append(tag("path", d="M375,45 V75", cls="tap"))
    out.append(tag("path", d="M520,160 H580", cls="tap"))
    out.append(tag("path", d="M520,330 H580", cls="tap"))

    out += box(290, 75, 170, 56, "5 V converter", ["5 A for the Pi"])
    out += box(290, 165, 170, 70, "Raspberry Pi 5", ["kiosk software"])
    out += box(290, 275, 170, 56, "USB to RS485", ["adapter"])
    out.append(arrow(p, [(375, 131), (375, 165)]))
    out.append(label(383, 152, "5 V", "lbl", "start", 13))
    out.append(arrow(p, [(375, 235), (375, 275)], both=True))
    out.append(label(383, 259, "USB", "lbl", "start", 13))

    out += box(580, 130, 200, 100, "Lock board 1", ["24 channels", "address 1"])
    out += box(580, 300, 200, 100, "Lock board 2", ["24 channels", "address 2"])
    out.append(arrow(p, [(460, 303), (490, 303), (490, 200), (580, 200)], both=True))
    out.append(label(482, 258, "RS485", "lbl", "end", 13))
    out.append(arrow(p, [(680, 230), (680, 300)], both=True))
    out.append(label(688, 270, "RS485", "lbl", "start", 13))

    doors = [("Door 1", 110, 150), ("Door 2", 160, 170), ("Door 24", 240, 210),
             ("Door 25", 300, 320), ("Door 30", 385, 380)]
    for name, y, from_y in doors:
        out.append(arrow(p, [(780, from_y), (860, y + 20)]))
    out.append(tag("rect", x=812, y=105, width=16, height=320, rx=3, cls="strip"))
    for name, y, _ in doors:
        out += box(860, y, 160, 40, name, [], title_size=14)
    out.append(label(940, 228, "⋮", "lbl", "middle", 18))
    out.append(label(940, 368, "⋮", "lbl", "middle", 18))
    out.append(label(940, 96, "4 wires per door", "lbl", "middle", 13))
    out.append(label(820, 446, "terminal strip", "lbl", "middle", 13))

    aria = ("Wiring: the wall outlet feeds a 12 volt 10 amp power supply and a 12 volt UPS with a LiFePO4 battery. "
            "A 12 volt bus powers a 5 volt converter for the Raspberry Pi and both 24-channel lock boards. The Pi "
            "talks to lock board 1 through a USB to RS485 adapter, and board 1 passes the RS485 line on to board 2. "
            "Board 1 drives doors 1 to 24 and board 2 drives doors 25 to 30, four wires per door, through a "
            "terminal strip in the service cabinet.")
    return svg(1060, 460, aria, out)


def main():
    template = (HERE / "locks_template.html").read_text(encoding="utf-8")
    page = template.replace("{{MECHANISM}}", mechanism()).replace("{{WIRING}}", wiring())
    assert "{{" not in page
    (HERE / "locker-locks.html").write_text(page, encoding="utf-8")
    body_start = page.index('<main class="page">')
    standalone = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                  + page[:body_start] + "</head>\n<body>\n" + page[body_start:] + "\n</body>\n</html>\n")
    (HERE / "up-oval-locker-locks.html").write_text(standalone, encoding="utf-8")
    print("wrote locker-locks.html and up-oval-locker-locks.html")


if __name__ == "__main__":
    main()
