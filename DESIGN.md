---
name: SarapSulit (FARM2FIGURE)
description: Filipino dishes ranked by nutrition per peso, at today's palengke prices.
colors:
  forest-deep: "#163F2E"
  forest: "#1D5239"
  forest-bright: "#2F7A55"
  sage: "#559370"
  mint-wash: "#EFF5F0"
  mint-picked: "#D9E8DD"
  leaf: "#4E9F3A"
  gold: "#DDAE2B"
  gold-light: "#E6C265"
  gold-deep: "#855F0E"
  price-tag-bg: "#F6EBCD"
  incomplete-amber: "#C9961A"
  cream: "#F8F4EA"
  cream-line: "#E7DFCB"
  cream-hover: "#E9E2CF"
  card-white: "#FFFFFF"
  ink: "#111827"
  ink-muted: "#6B7280"
  price-up: "#DC2626"
  meter-mid: "#D98A2B"
  meter-low: "#C8553D"
  night-bg: "#0F1F18"
  night-surface: "#16291F"
  night-surface-2: "#1C3326"
  night-line: "#24402F"
  night-text: "#E6F4EC"
  night-text-2: "#B4CCBE"
  night-mint: "#7CE0A3"
  night-mango: "#F5B841"
  rain-navy: "#1E3A5F"
  rain-blue: "#2F5D8C"
  rain-mist: "#E3EAF2"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "3.75rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  card-title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.025em"
  brand-word:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.62rem"
    fontWeight: 800
    letterSpacing: "0.14em"
  receipt:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8rem"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  card: "1rem"
  dialog: "1.25rem"
  pill: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "3rem"
  container: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.forest-deep}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    padding: "0.625rem 1.25rem"
    typography: "{typography.small}"
  button-primary-hover:
    backgroundColor: "{colors.forest}"
  button-ghost-on-dark:
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    padding: "0.375rem 1rem"
  toggle-chip:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "0.35rem 0.8rem"
    typography: "{typography.label}"
  toggle-chip-on:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.card-white}"
  nav-tab-active:
    backgroundColor: "{colors.forest-deep}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1rem"
  hero-search:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.forest-deep}"
    rounded: "{rounded.pill}"
    padding: "0.35rem 0.35rem 0.35rem 1.1rem"
  recipe-card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "1rem"
  price-tag:
    backgroundColor: "{colors.price-tag-bg}"
    textColor: "{colors.gold-deep}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
    typography: "{typography.label}"
  incomplete-badge:
    backgroundColor: "{colors.incomplete-amber}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.5rem"
    typography: "{typography.label}"
  toast:
    backgroundColor: "{colors.forest-deep}"
    textColor: "{colors.cream}"
    rounded: "{rounded.card}"
    padding: "0.75rem 1.1rem"
---

# Design System: SarapSulit (FARM2FIGURE)

## Overview

**Creative North Star: "The Honest Palengke"**

SarapSulit should feel like a tidy, trusted market stall. Warm cream paper sits under forest-green
signage, and gold marks the price tags. Everything is friendly and within reach, and the numbers
are always out in the open. The palette comes from the logo (forest leaf, gold grain): green
means "go, sulit", gold means money and value, and cream is the counter everything sits on.

It is moderately dense. There are many dishes, prices and filters, but they're grouped into soft
cards and pill toggles so a cook can scan with one thumb. Headings use a warm editorial serif
(Fraunces) for personality, and everything functional uses a plain sans (Inter). Motion is
light and kind: cards rise in, the sulit meter fills, the logo's leaf sways once. All of it
switches off under reduced motion.

The look has three moods built on the same structure. **Day** is forest and cream.
**Night market** (dark mode) is deep green with mint and mango. **Rainy** turns the site blue on
rainy days. Every new surface has to work in all three.

**Key Characteristics:**
- Forest green and cream, with gold reserved for value and price cues
- A serif for headings, a sans for UI, and a monospace receipt for totals
- Pills for every control, soft 1rem cards, and a light lift on hover
- Honesty markers ("≈", "⚠ Incomplete price", "+" after a cost) are part of the design, not noise
- Mobile-first: a bottom tab bar on phones and a sticky frosted header on desktop
- Three themes on one structure: day, Night market, and rainy

## Colors

The day palette is warm and grounded: a forest-green scale and a gold scale on cream paper.
Tailwind's own `green` and `amber` scales are re-pointed to these hues in the `tailwind.config`
block in `docs/index.html`, so every `green-*` and `amber-*` class follows the brand.

### Primary
- **Palengke Forest** (forest-deep): the hero band, the active nav tab, primary buttons and
  toasts. It is the brand's main surface colour.
- **Working Forest** (forest): selected toggles, progress bars, counts, links and the planner's
  selected borders. It is the "active" colour.
- **Sulit Green** (forest-bright): price drops and the top segment of the sulit meter, so green
  always means "good value".

### Secondary
- **Harvest Gold** (gold, gold-light): the hero accent word ("sulit."), the hero stat numbers and
  the tour highlight ring. It stands for value and attention.
- **Price-tag Gold** (price-tag-bg with gold-deep text): the "₱/serving" tag on cards and the
  Almusal meal tag.
- **Incomplete Amber** (incomplete-amber): the "⚠ Incomplete price" badge.

### Tertiary
- **Leaf** (leaf, sage): the radial glow in the hero and secondary green accents.
- **Meter warm steps** (meter-mid, meter-low) and **Price Up** (price-up): the low end of the
  sulit meter and price rises.

### Neutral
- **Counter Cream** (cream): the page background, the search field and the header (92% opacity
  with blur).
- **Cream Line** (cream-line) and **Cream Hover** (cream-hover): header and nav borders, empty
  meter segments, and hover fills on cream.
- **Card White** (card-white): cards, toggles and dialogs sit on cream as white surfaces.
- **Ink** (ink) and **Ink Muted** (ink-muted): body text, plus Tailwind's gray scale for
  secondary text.

### Night market (dark mode)
- The surfaces are **night-bg**, **night-surface** and **night-surface-2**, with **night-line**
  for borders. Text uses **night-text** and **night-text-2**.
- **night-mint** replaces forest as the active colour. **night-mango** replaces gold.
- Dark mode is applied with `html.dark` overrides and CSS variables (`--bg`, `--s1`, `--s2`,
  `--line`, `--tx`, `--tx2`, `--tx3`, `--mint`, `--mango`).

### Rainy
- `body.rainy` swaps forest for **rain-navy** and **rain-blue**, and cream for **rain-mist**.
- Gold turns sky-blue (#bae6fd) on the hero.

### Named Rules
**The Green Means Sulit Rule.** Green is for good value and active state. Red and warm oranges
are only for price rises and the low end of the sulit meter. Never use green to decorate
something that is bad value.

**The Gold Is Money Rule.** Gold and amber mark prices, value and the one accent word in the
hero. Don't use gold for generic decoration or for buttons.

**The Three Moods Rule.** Every new colour needs a day value, a Night market value
(`html.dark …`) and a rainy value (`body.rainy …`), or it must inherit cleanly from one that
already has them.

## Typography

**Display Font:** Fraunces (with Georgia, serif), weights 500 to 700, optical size 9..144
**Body Font:** Inter (with sans-serif), weights 400 to 800
**Receipt Font:** the system monospace (ui-monospace, SFMono-Regular, Menlo)

**Character:** a warm, slightly old-fashioned serif gives the headings a cookbook feel, while
Inter keeps prices, labels and controls plain and legible. The monospace receipt makes totals
look like a real resibo.

### Hierarchy
- **Display** (Fraunces 600, 2.25rem on phones and 3.75rem from `sm`, line-height 1.05): only
  the hero headline, "Masarap, masustansya, *sulit.*", with the accent word italic in gold.
- **Headline** (Fraunces 700, 1.875rem): the h1 at the top of each section ("Browse Filipino
  Recipes", "Weekly Planner", "Anong lulutuin?").
- **Title** (Fraunces 700, 1.5rem): the h2 of each block inside a section ("Top Value Dishes
  Today", "Today's weather picks").
- **Card title** (Fraunces 600, 1rem, line-height 1.375): dish names on cards.
- **Body** (Inter 400, 1rem) and **Small** (Inter 400, 0.875rem): descriptions and helper text.
  The hero subcopy is capped at about 36rem.
- **Label** (Inter 600, 0.75rem, often uppercase with 0.025em tracking): categories, toggle
  rows ("WEATHER", "SORT"), meal tags and price tags.
- **Brand word** (Inter 800, 0.62rem, 0.14em tracking, uppercase): only the FARM2FIGURE word
  under the logo.

### Named Rules
**The Serif Speaks, the Sans Works Rule.** Fraunces is only for h1, h2, h3 and `.font-display`.
Numbers, prices, buttons and labels are always Inter, or the monospace in receipts.

**The Tabular Money Rule.** Columns of prices use tabular figures (`font-variant-numeric:
tabular-nums`) so pesos line up.

## Layout

- **Width:** a centred column with a maximum of 72rem (`max-w-6xl`) and 1rem side gutters
  (`px-4`). Reading areas narrow further (the hero text is `max-w-3xl`, How It Works is
  `max-w-5xl`).
- **Rhythm:** sections are separated by about 3rem of vertical space (`py-12`). Card grids use a
  1.25rem gap.
- **Grids:**
  - Dish grids are 1 column on phones, 2 from `sm` (640px) and 4 from `lg` (1024px).
  - How It Works has 3 columns from `sm`.
- **Weekly planner:** a 7-day grid (a 5.5rem label column plus seven columns at least 7.5rem
  wide, 60rem minimum). It scrolls sideways on phones instead of squashing.
- **Navigation:**
  - At 640px and wider, a sticky 4.5rem header with the logo, scrolling pill tabs, a tour "?"
    button and a theme toggle.
  - Below 640px, the header tabs hide and a fixed 6-item bottom tab bar takes over. Body
    padding at the bottom (4.5rem) and the toast and tour positions all respect it.
- **Hero:** a full-bleed forest band with centred content: an eyebrow line with the DA date, the
  display headline, subcopy, the pill search, two ghost shortcut pills and a 3-stat row.

## Elevation & Depth

**Light lift.** Surfaces are flat cream and white at rest. Soft shadows are used only on cards,
dialogs, the hero search and toasts. On hover, cards rise by 3px and their shadow deepens. In
Night market mode, shadows become darker and wider, with a faint top highlight.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 1px 3px rgba(0,0,0,.08)`, Tailwind `shadow`): recipe and finder
  cards, and skeletons.
- **Card hover** (`box-shadow: 0 4px 12px rgba(0,0,0,.12)`, Tailwind `shadow-lg`, plus
  `translateY(-3px)`): hover state only.
- **Floating** (`box-shadow: 0 10px 30px rgba(0,0,0,.18)`): the hero search and toasts.
- **Dialog** (`box-shadow: 0 20px 50px rgba(0,0,0,.25)`): the alert, share and tour cards.
- **Night lift** (`box-shadow: 0 1px 0 rgba(255,255,255,.03), 0 4px 16px rgba(0,0,0,.35)`): every
  shadowed surface in dark mode.

### Named Rules
**The Lift Is Earned Rule.** Only things you can tap or that float above the page get a shadow.
Toggle rows, section blocks and the header use borders or blur, never a shadow.

## Shapes

The shapes are soft and friendly.
- **Controls are pills:** buttons, nav tabs, toggles, chips, tags, badges and the search field
  (9999px).
- **Containers:** cards use 1rem corners, dialogs and the tour card use 1.25rem, and planner
  cells and dish rows use 0.75rem.
- **Thumbnails:** small thumbnails use 0.5rem.
- **Borders:** hairlines (1px) in cream-line or gray-100/200. The planner's empty cells use a
  1.5px dashed border to say "drop a dish here", and receipt totals sit under a 2px dashed rule,
  like a torn-off resibo.
- **Images** fill the card top edge to edge and are clipped by the card radius.

## Components

### Buttons
- **Character:** soft, round and friendly.
- **Shape:** always pills (9999px).
- **Primary:** Palengke Forest fill with cream text, Inter 600 at 0.875rem, 0.625rem × 1.25rem
  padding. Hover goes to Working Forest.
- **Ghost on dark:** in the hero, a transparent pill with a 25% white border and cream text.
  Hover fills it with 10% white.
- **Icon buttons:** round 2.25rem buttons (the tour "?" and the theme toggle) with a cream-line
  border. The theme icon tilts when pressed.
- **Video:** a YouTube red pill and a TikTok black pill. These are the only off-brand fills,
  because they're borrowed platform cues.

### Chips (toggles and filters)
- **Style:** a white pill with a gray-200 hairline and gray-600 label text at 0.75rem.
- **State:** hover fills mint-wash. **On** fills Working Forest with white text. In dark mode
  it's night-mint with dark text; in rainy mode, rain-blue.
- **Finder chips** use the same shape at 0.8rem. Selected is mint-picked with a forest border.

### Cards / Containers
- **Recipe card:**
  - A white card with 1rem corners and rest shadow. The image area (11rem, `h-44`) sits on a
    price-tag-gold placeholder.
  - Below it are the title, an uppercase category label, the sulit meter, and a row of tags
    (price per serving, nutrition score, protein).
  - On hover the card lifts, the image zooms to 1.05× and the title turns forest.
- **Price cheap-card:** a cream panel with a cream-line border and 0.9rem corners. Each row has
  the price in bold forest.
- **Skeletons:** the same card shape with a cream shimmer.

### Inputs / Fields
- **Hero search:** a cream pill with a floating shadow, a transparent input and a primary pill
  button tucked inside.
- **Other inputs:** gray-200 hairline pills or rounded fields. The focus ring is 2px green-500,
  or sage in the finder.
- In dark mode, inputs take night-surface-2 with night-line borders.

### Navigation
- **Desktop header:** frosted cream (92% opacity with blur). Tabs are forest-text pills. The
  active tab is a Palengke Forest fill with cream text, and hover is cream-hover.
- **Phone bottom bar:** frosted cream with six icon-and-label items. Active is forest text on a
  pale green pill. It respects the safe-area inset.

### Sulit Meter (signature)
- Five short pill segments that fill by how the dish ranks against all others, with a short
  label beside them.
- Colours run from Sulit Green (top) through sage and gold to orange and brick-red (low).
- The segments animate in one after another. A larger version is used in the recipe pop-up.

### Honesty Markers (signature)
- The **"⚠ Incomplete price"** amber pill sits on the card image.
- **"₱N+"** means part of the cost is unpriced. **"≈"** marks derived prices and estimated
  grams.
- These are first-class parts of the design and are never hidden or made faint.

### Receipt (signature)
- The planner receipt uses the monospace font with tabular numbers, a bold day heading, a muted
  quantity, and a dashed-rule bold total.

### Meal Tags
- Small pills: Almusal is gold, Ulam is green and Meryenda is terracotta (#F5DCD3 / #8A3B22).
  Each has a Night market pair.

## Do's and Don'ts

### Do:
- **Do** build on Tailwind's re-pointed `green-*` and `amber-*` classes, so the day palette, the
  `html.dark` overrides and the `body.rainy` overrides all apply automatically.
- **Do** give every new colour a day, a Night market and a rainy value (The Three Moods Rule).
- **Do** use pills for every control and 1rem cards for content.
- **Do** keep "≈", "+", "⚠ Incomplete price" and price sources visible at full strength.
- **Do** use Fraunces only for headings and Inter for anything with a number in it.
- **Do** test on a 375px phone with the bottom tab bar showing, and check the toast and tour
  clear it.
- **Do** respect `prefers-reduced-motion`. The global rule turns off every animation and
  transition.
- **Do** prefix new global CSS classes and JS names (for example `share-`, `fx-`, `plan-`),
  because all scripts share one global scope.

### Don't:
- **Don't** hide or soften an honesty marker to make a card look cleaner.
- **Don't** use green on something that is bad value, or gold as generic decoration.
- **Don't** add shadows to flat structure (sections, toggle rows, the header). Shadows are for
  tappable or floating things only.
- **Don't** add a colour without dark and rainy overrides. It will break in Night market mode or
  on rainy days.
- **Don't** use Fraunces for prices, buttons or labels.
- **Don't** put essential actions only at the top of the screen on phones. The bottom bar is
  where the thumb is.
