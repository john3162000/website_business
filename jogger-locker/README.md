# Jogger locker kiosk: weather check

How many 5-8 AM and 5-8 PM jogging windows at the UP Diliman Academic Oval
were dry enough to jog over the last 365 days (21 Sep 2025 to 20 Sep 2026),
and what that means for a 30-locker kiosk.

## Result

573 of 730 windows were joggable (78%): 306 mornings and 267 evenings.
January to April was 96% joggable; June to September was 57%, and August
was the worst month at 19 of 62.

Open `results/up-oval-jogging-weather.html` for the calendar, monthly chart and revenue
calculator.

## Rules

- A window is rained out when any hour inside it has 0.5 mm of rain or more,
  or when an hour in the two hours before has 2.5 mm or more.
- Drizzle under 0.5 mm per hour counts as jogged.

## Rerun it

1. Download the hourly CSV from Open-Meteo and save it as
   `data/up_oval_hourly_best_match.csv`:

   https://archive-api.open-meteo.com/v1/archive?latitude=14.6537&longitude=121.0685&start_date=2025-09-21&end_date=2026-09-20&hourly=precipitation,rain,temperature_2m,apparent_temperature,weather_code&timezone=Asia%2FManila&format=csv

   To cover a different year, change `start_date` and `end_date` in the link
   and `START` and `END` in `weather_analysis.py`.

2. Run `python3 weather_analysis.py` (standard library only). It rewrites
   everything in `results/`.

## Files

- `weather_analysis.py`: labels every window and writes the results
- `dashboard_template.html`: page template; the script fills in the data
- `data/`: raw hourly weather from Open-Meteo
- `results/sessions_best_match.csv`: one row per window, with rain figures
- `results/summary.json`: totals, monthly counts and sensitivity checks
- `results/dashboard.html`: the finished page, as published to Claude
- `results/up-oval-jogging-weather.html`: the same page as a stand-alone file to
  save and open in any browser

## Locker design

`design/` holds the proposed 30-door locker bank for a 2 x 2 m spot: an L
of two wings, three 400 mm columns each, joined by a corner block, with 10
small doors with USB charging, 20 backpack doors and a control column next
to the inner corner. Each wing is 1.82 x 0.62 m and 1.85 m tall, leaving a
1.38 m square to stand in. The page also estimates rent for the spot at
DiliMall and Gyud Food. (Proposal 1 was a 2.80 m straight bank.)

- `design/build_locker_bank.py`: draws the unfolded elevation, section and
  floor plan from the door layout in `COLUMNS` and `FOLD` (columns on the
  left wing) and fills them into the template
- `design/locker_bank_template.html`: page text and styling
- `design/locker-bank.html`: the finished page, as published to Claude
- `design/up-oval-locker-bank.html`: stand-alone copy to save and open

Rerun with `python3 design/build_locker_bank.py` after changing the layout.

## System architecture

`architecture/` describes how the unstaffed kiosk works: a Raspberry Pi in the
kiosk drives RS485 lock boards and checks PINs offline, a Next.js + Prisma app
on Render takes PayMongo QR Ph payments by webhook and sends PINs through
Semaphore, and the kiosk talks to the server over one HTTPS connection with a
long-poll for commands. The page covers the rent and open sequences, rental
states, failure handling, data, API, security, running costs and a build plan.

- `architecture/build_architecture.py`: draws the diagrams (the sequences
  live in `RENT_STEPS` and `OPEN_STEPS`) and fills them into the template
- `architecture/architecture_template.html`: page text and styling
- `architecture/system-architecture.html`: the finished page, as published
- `architecture/up-oval-locker-system.html`: stand-alone copy to save and open

## Door locks

`locks/` explains the lock on each door: a 12 V fail-secure electronic cabinet
lock with a built-in door switch and a key override. A short pulse opens it,
pushing the door shut relocks it, and two 24-channel RS485 lock boards drive
all 30 locks from the Pi. The page compares lock types, shows the wiring,
lists what to ask suppliers with a parts budget, and gives a bench test.

- `locks/build_locks.py`: draws the latch mechanism and wiring diagrams
- `locks/locks_template.html`: page text and styling
- `locks/locker-locks.html`: the finished page, as published
- `locks/up-oval-locker-locks.html`: stand-alone copy to save and open

## 3D model

`model/` builds an interactive three.js model of the locker bank from the
same L-shaped door layout as `design/`, standing in a taped 2 x 2 m spot, with
a scripted rental at door 23 (pay by QR, store a backpack, collect it with the
PIN), tap-to-open doors, a canopy, size colors, a 1.60 m figure for scale and
5 AM lighting.

- `model/build_model.py`: fills the template with the design measurements;
  `--three-dir node_modules/three` (three@0.147.0) inlines three.js into the
  stand-alone copy so it opens offline
- `model/locker_3d_template.html`: page, scene and animation code
- `model/locker-3d.html`: the page as published (three.js from jsDelivr)
- `model/up-oval-locker-3d.html`: stand-alone copy with three.js inside
- `model/up-oval-locker.glb`: the locker bank as a glTF model with two door
  animations, for 3D viewer apps and fabricators
- `model/render_media.js`: exports the .glb and renders the rental video
  frame by frame with Playwright (encode with the ffmpeg line in the file)

## All pages in one

`compile_pages.py` puts the five pages in one page with a tab each: Weather,
Design, System, Locks and 3D model. Each tab opens its page in its own frame,
so styles and scripts stay separate. Build the five pages first, then run
`python3 compile_pages.py`.

- `tabs_template.html`: the tab bar. It passes light or dark mode to every
  tab, links a tab by its address (`#weather`, `#design`, `#system`, `#locks`,
  `#model`), and unloads the 3D tab when you leave it
- `all-pages.html`: the page as published (three.js from jsDelivr)
- `up-oval-locker-kiosk.html`: stand-alone copy with three.js inside, so all
  five tabs open offline

Weather data: [Open-Meteo.com](https://open-meteo.com/), CC BY 4.0.
