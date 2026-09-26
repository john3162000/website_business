#!/usr/bin/env python3
"""
Draws the jogger locker system diagrams as inline SVG (parts and connections,
the rent and open sequences, rental states) and fills them into
architecture_template.html:

  system-architecture.html     the page as published to Claude
  up-oval-locker-system.html   stand-alone copy to save and open in a browser

The sequences live in RENT_STEPS and OPEN_STEPS; edit them and rerun.
Standard library only:  python3 build_architecture.py
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
    return (f'<defs><marker id="{prefix}-ah" {head}><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker>'
            f'<marker id="{prefix}-ahp" {head}><path d="M0,0 L10,5 L0,10 z" class="ah-pay"/></marker></defs>')


def arrow(prefix, points, pay=False, dashed=False, both=False):
    d = "M" + " L".join(f"{num(x)},{num(y)}" for x, y in points)
    cls = "ln" + (" ln-pay" if pay else "") + (" ln-dash" if dashed else "")
    marker = f"url(#{prefix}-{'ahp' if pay else 'ah'})"
    return tag("path", d=d, cls=cls, marker_end=marker, marker_start=marker if both else None)


def box(x, y, w, h, title, lines=(), cls="box", title_size=16, line_size=14):
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


# ---------------------------------------------------------------- S-01

def context():
    p = "c"
    K, C, S = 200, 650, 1025          # left edges of the kiosk, cloud and services zones
    out = [markers(p)]
    out.append(tag("rect", x=K, y=30, width=410, height=570, rx=14, cls="zone"))
    out.append(tag("rect", x=C, y=30, width=310, height=570, rx=14, cls="zone"))
    out.append(tag("rect", x=S, y=30, width=255, height=320, rx=14, cls="zone"))
    out.append(label(K + 16, 56, "AT THE OVAL", "zone-t", "start", 13))
    out.append(label(C + 16, 56, "CLOUD", "zone-t", "start", 13))
    out.append(label(S + 16, 56, "OUTSIDE SERVICES", "zone-t", "start", 13))

    out += box(K + 20, 75, 170, 66, "12 V UPS", ["signals power loss"])
    out += box(K + 220, 75, 170, 66, "4G router", ["venue Wi-Fi backup"])
    out += box(K + 20, 185, 370, 170, "Kiosk computer",
               ["Raspberry Pi 5, Python", "SQLite: doors, rentals, PIN hashes",
                "Checks PINs and opens doors offline", "Queues events until online"], cls="box key")
    out += box(K + 20, 400, 170, 66, "Touch screen", ["10.1-inch"])
    out += box(K + 220, 400, 170, 66, "Lock boards", ["RS485, 32 channels"])
    out += box(K + 220, 510, 170, 66, "30 locks", ["and door sensors"])
    out.append(arrow(p, [(K + 105, 141), (K + 105, 185)]))
    out.append(label(K + 113, 168, "power", "lbl", "start", 13))
    out.append(arrow(p, [(K + 305, 141), (K + 305, 185)], both=True))
    out.append(label(K + 313, 168, "Ethernet", "lbl", "start", 13))
    out.append(arrow(p, [(K + 105, 355), (K + 105, 400)], both=True))
    out.append(label(K + 113, 383, "HDMI, USB", "lbl", "start", 13))
    out.append(arrow(p, [(K + 305, 355), (K + 305, 400)], both=True))
    out.append(label(K + 313, 383, "RS485", "lbl", "start", 13))
    out.append(arrow(p, [(K + 305, 466), (K + 305, 510)], both=True))
    out.append(label(K + 313, 493, "12 V, sensors", "lbl", "start", 13))

    out += box(C + 20, 75, 270, 270, "Web app",
               ["Next.js on Render", "Kiosk API and command channel", "PayMongo webhook",
                "Owner dashboard, remote open", "Jogger status page"])
    out += box(C + 20, 385, 270, 80, "PostgreSQL", ["Supabase, Singapore"])
    out += box(C + 20, 500, 270, 80, "Scheduled jobs", ["offline checks, reminders,", "nightly payment match"])
    out.append(arrow(p, [(C + 155, 345), (C + 155, 385)], both=True))
    out.append(label(C + 163, 370, "Prisma", "lbl", "start", 13))
    out.append(arrow(p, [(C + 155, 500), (C + 155, 465)]))
    out.append(label(C + 163, 488, "reads, writes", "lbl", "start", 13))

    out += box(S + 15, 75, 225, 90, "PayMongo", ["QR Ph payments", "and refunds"])
    out += box(S + 15, 225, 225, 90, "Semaphore", ["SMS: PINs and", "owner alerts"])

    out.append(arrow(p, [(K + 390, 108), (C + 20, 108)], both=True))
    out.append(label((K + 390 + C + 20) / 2, 98, "HTTPS, 4G", "lbl", "middle", 13))
    gap_mid = (C + 290 + S + 15) / 2
    out.append(arrow(p, [(C + 290, 100), (S + 15, 100)], pay=True))
    out.append(label(gap_mid, 91, "create QR", "lbl-pay", "middle", 13))
    out.append(arrow(p, [(S + 15, 140), (C + 290, 140)], pay=True))
    out.append(label(gap_mid, 160, "webhook", "lbl-pay", "middle", 13))
    out.append(arrow(p, [(C + 290, 270), (S + 15, 270)]))
    out.append(label(gap_mid, 261, "send SMS", "lbl", "middle", 13))

    out += box(10, 395, 120, 80, "Jogger", ["with a phone"], cls="box person")
    out.append(arrow(p, [(130, 433), (K + 20, 433)]))
    out.append(label((130 + K + 20) / 2, 424, "rent, PIN", "lbl", "middle", 13))
    out.append(arrow(p, [(55, 475), (55, 690), (1295, 690), (1295, 120), (S + 240, 120)], pay=True))
    out.append(label(700, 682, "pays by scanning the QR in GCash, Maya or a bank app", "lbl-pay", "middle", 13))
    out.append(arrow(p, [(S + 128, 315), (S + 128, 650), (85, 650), (85, 475)]))
    out.append(label(700, 642, "SMS with the PIN", "lbl", "middle", 13))

    aria = ("System parts. At the Oval: a touch screen, a Raspberry Pi kiosk computer that checks PINs "
            "and opens doors even offline, RS485 lock boards driving 30 locks with door sensors, a 12 volt "
            "UPS and a 4G router. The kiosk reaches a Next.js web app on Render over HTTPS; the web app uses "
            "PostgreSQL on Supabase and scheduled jobs. The web app asks PayMongo for QR codes and receives "
            "payment webhooks, and sends SMS through Semaphore. The jogger pays PayMongo from their own phone "
            "and receives the PIN by SMS.")
    return svg(1310, 720, aria, out)


# ---------------------------------------------------------------- S-02, S-03

RENT_PARTS = [
    ("j", "Jogger", "with a phone"),
    ("k", "Kiosk", "screen and Pi"),
    ("l", "Lock board", "RS485"),
    ("s", "Server", "Next.js app"),
    ("p", "PayMongo", "QR Ph"),
    ("m", "Semaphore", "SMS"),
]
RENT_STEPS = [
    ("call", "j", "k", "choose size, enter mobile number"),
    ("call", "k", "s", "POST /api/kiosk/rentals"),
    ("self", "s", "hold lowest free door for 5 min"),
    ("call", "s", "p", "create ₱50 QR Ph payment"),
    ("reply", "p", "s", "QR code"),
    ("reply", "s", "k", "door 12 and the QR"),
    ("reply", "k", "j", "show QR and a 5-minute timer"),
    ("pay", "j", "p", "scan and pay in GCash or a bank app"),
    ("pay", "p", "s", "webhook: payment.paid"),
    ("self", "s", "start rental, make PIN, ends in 4 h"),
    ("call", "s", "k", "command: start rental, door 12, PIN"),
    ("call", "k", "l", "open door 12"),
    ("reply", "k", "j", "Door 12 is open. PIN 482913"),
    ("call", "s", "m", "send PIN"),
    ("reply", "m", "j", "SMS: PIN, end time, help number"),
    ("reply", "l", "k", "door 12 closed"),
    ("call", "k", "s", "event: door 12 closed"),
]

OPEN_PARTS = RENT_PARTS[:5]
OPEN_STEPS = [
    ("call", "j", "k", "door 12 and PIN"),
    ("self", "k", "check PIN hash, no internet needed"),
    ("frame", "On time"),
    ("call", "k", "l", "open door 12"),
    ("call", "k", "s", "event: rental ended (queued if offline)"),
    ("else", "Late, kiosk online"),
    ("reply", "k", "j", "1 h 20 min over: ₱40"),
    ("call", "k", "s", "ask for an overtime QR"),
    ("call", "s", "p", "create ₱40 QR Ph payment"),
    ("reply", "s", "k", "QR code"),
    ("pay", "j", "p", "pay ₱40"),
    ("pay", "p", "s", "webhook: payment.paid"),
    ("call", "s", "k", "command: open door 12"),
    ("call", "k", "l", "open door 12"),
    ("else", "Late, kiosk offline"),
    ("call", "k", "l", "open door 12 anyway"),
    ("self", "k", "record ₱40 owed, send it later"),
    ("end",),
]


def sequence(prefix, parts, steps, aria, gap=190, side=100, top=14):
    xs = {key: side + i * gap for i, (key, _, _) in enumerate(parts)}
    width = side * 2 + gap * (len(parts) - 1)
    msgs, frames = [], []
    y = top + 62 + 44
    n = 0
    for step in steps:
        kind = step[0]
        if kind == "frame":
            frames.append({"label": step[1], "top": y - 22, "elses": []})
            y += 30
        elif kind == "else":
            frames[-1]["elses"].append((step[1], y - 22))
            y += 30
        elif kind == "end":
            frames[-1]["bottom"] = y - 18
            y += 20
        elif kind == "self":
            n += 1
            x = xs[step[1]]
            msgs.append(arrow(prefix, [(x, y - 8), (x + 40, y - 8), (x + 40, y + 16), (x + 6, y + 16)]))
            msgs.append(label(x + 50, y + 9, f"{n}. {step[2]}", "lbl", "start", 14))
            y += 50
        else:
            n += 1
            _, a, b, text = step
            x1, x2 = xs[a], xs[b]
            d = 6 if x2 > x1 else -6
            msgs.append(arrow(prefix, [(x1 + d, y), (x2 - d, y)], pay=kind == "pay", dashed=kind == "reply"))
            msgs.append(label((x1 + x2) / 2, y - 8, f"{n}. {text}",
                              "lbl-pay" if kind == "pay" else "lbl", "middle", 14))
            y += 44
    height = y - 10

    back = []
    for f in frames:
        x0, x1 = 16, width - 16
        back.append(tag("rect", x=num(x0), y=num(f["top"]), width=num(x1 - x0),
                        height=num(f["bottom"] - f["top"]), rx=6, cls="frame"))
        back.append(tag("rect", x=num(x0), y=num(f["top"]), width=num(len(f["label"]) * 7.6 + 24),
                        height=26, rx=6, cls="frame-tab"))
        back.append(label(x0 + 12, f["top"] + 18, f["label"], "frame-t", "start", 13))
        for text, yy in f["elses"]:
            back.append(tag("line", x1=num(x0), y1=num(yy), x2=num(x1), y2=num(yy), cls="frame-sep"))
            back.append(label(x0 + 12, yy + 18, text, "frame-t", "start", 13))
    heads = []
    for key, title, sub in parts:
        x = xs[key]
        heads.append(tag("line", x1=num(x), y1=num(top + 62), x2=num(x), y2=num(height - 4), cls="life"))
        heads.append(tag("rect", x=num(x - gap / 2 + 14), y=num(top), width=num(gap - 28), height=62, rx=8,
                         cls="hdr person" if key == "j" else "hdr"))
        heads.append(label(x, top + 26, title, "hdr-t", "middle", 16))
        heads.append(label(x, top + 48, sub, "hdr-s", "middle", 13))
    return svg(width, height, aria, [markers(prefix)] + back + heads + msgs)


# ---------------------------------------------------------------- S-04

def states():
    p = "t"
    out = [markers(p)]
    w, h = 170, 62
    boxes = {
        "hold": (80, 120, "Holding a door", "5 minutes to pay", "state"),
        "active": (370, 120, "Active", "paid, 4-hour rental", "state"),
        "late": (660, 120, "Late", "10 min past end time", "state"),
        "ended": (950, 120, "Ended", "things collected", "state done"),
        "released": (80, 310, "Released", "door freed", "state done"),
        "refunded": (370, 310, "Refunded", "money returned", "state done"),
        "abandoned": (660, 310, "Abandoned", "items kept 30 days", "state done"),
    }
    for x, y, title, sub, cls in boxes.values():
        out += box(x, y, w, h, title, [sub], cls=cls, line_size=13)
    cy = 120 + h / 2
    out.append(tag("circle", cx=40, cy=num(cy), r=9, cls="dot"))
    out.append(arrow(p, [(49, cy), (80, cy)]))
    out.append(arrow(p, [(250, cy), (370, cy)]))
    out.append(label(310, cy - 10, "paid", "lbl", "middle", 13))
    out.append(arrow(p, [(540, cy), (660, cy)]))
    out.append(label(600, cy - 10, "time runs out", "lbl", "middle", 13))
    out.append(arrow(p, [(830, cy), (950, cy)]))
    out.append(label(890, cy - 10, "overtime paid", "lbl", "middle", 13))
    out.append(label(890, cy + 24, "or owed", "lbl", "middle", 13))
    out.append(arrow(p, [(455, 120), (455, 70), (1035, 70), (1035, 120)]))
    out.append(label(745, 62, "PIN entered in time", "lbl", "middle", 13))
    for x, first, second in ((165, "QR expired", "or cancelled"), (455, "door would", "not open"),
                             (745, "not collected", "in 24 hours")):
        out.append(arrow(p, [(x, 182), (x, 310)]))
        out.append(label(x + 10, 240, first, "lbl", "start", 13))
        out.append(label(x + 10, 258, second, "lbl", "start", 13))
    aria = ("Rental states. Holding a door becomes Active when paid, Released if the QR expires or is "
            "cancelled. Active becomes Ended when the PIN is entered in time, Late when time runs out, or "
            "Refunded if the door would not open. Late becomes Ended when overtime is paid or recorded as "
            "owed, or Abandoned if not collected in 24 hours.")
    return svg(1140, 400, aria, out)


def main():
    rent_aria = ("Rent sequence in 17 steps: the jogger picks a size and enters a mobile number; the kiosk asks "
                 "the server, which holds door 12 and asks PayMongo for a 50 peso QR code; the kiosk shows it; "
                 "the jogger pays in GCash or a bank app; PayMongo sends payment.paid to the server; the server "
                 "starts the rental, makes a PIN and commands the kiosk; the kiosk opens door 12 and shows the "
                 "PIN; the server texts the PIN through Semaphore; the door closes and the kiosk reports it.")
    open_aria = ("Open sequence: the jogger enters door 12 and the PIN and the kiosk checks the PIN hash "
                 "locally. On time, the kiosk opens the door and reports the rental ended. Late with internet, "
                 "the kiosk shows a 40 peso overtime fee, gets a QR through the server and PayMongo, and opens "
                 "after payment.paid. Late without internet, it opens anyway and records the 40 pesos owed.")
    template = (HERE / "architecture_template.html").read_text(encoding="utf-8")
    page = (template.replace("{{CONTEXT}}", context())
                    .replace("{{RENT}}", sequence("r", RENT_PARTS, RENT_STEPS, rent_aria))
                    .replace("{{OPEN}}", sequence("o", OPEN_PARTS, OPEN_STEPS, open_aria))
                    .replace("{{STATES}}", states()))
    assert "{{" not in page
    (HERE / "system-architecture.html").write_text(page, encoding="utf-8")
    body_start = page.index('<main class="page">')
    standalone = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                  + page[:body_start] + "</head>\n<body>\n" + page[body_start:] + "\n</body>\n</html>\n")
    (HERE / "up-oval-locker-system.html").write_text(standalone, encoding="utf-8")
    print("wrote system-architecture.html and up-oval-locker-system.html")


if __name__ == "__main__":
    main()
