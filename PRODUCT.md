# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Budget-conscious Filipino home cooks in Metro Manila who decide what ulam to cook and buy this
week. They mostly use phones, often low-end Android phones on mobile data, and speak and read
Taglish. They come to the site to answer everyday questions: "Anong ulam ngayon?", "Anong
lulutuin sa meron ako?", "Kasya ba ang ₱1,500 sa isang linggo?"

Some of them also follow a diet for diabetes, heart or high blood pressure, kidney or gout. The
diet filters serve them, but they are part of the same group, not a separate audience.

## Product Purpose

SarapSulit ranks Filipino recipes (from Panlasang Pinoy and other Filipino recipe sites) by **nutrition per peso**, priced at
today's market prices. A household can eat well for less by knowing which dishes are sulit
today, what each one really costs, and how those costs are moving.

Success means a cook leaves with a decision: a dish or a week of meals they can afford, with an
honest cost and nutrition picture behind it.

## Positioning

SarapSulit is not a recipe site with prices added. Every dish is costed line by line from
public market data (DA daily prices, then PSA OpenSTAT, then SM Markets or DTI SRP, then
labelled derived prices) and from Philippine nutrition data (FNRI Food Composition Table first).
That gives each dish a **Sulit Score**: nutrition ÷ cost per serving, recomputed as prices
change. No neighbouring product ranks everyday Filipino ulam by today's palengke prices with its
sources shown.

## Operating Context

- Used at home, before going to the palengke or supermarket, and while planning the week's meals.
- Prices follow DA's daily Metro Manila monitoring (updated every day) and PSA's monthly figures.
- The weather shapes what people want: sabaw on rainy days, cold merienda on hot days. The site
  uses the local weather (Open-Meteo) to suggest dishes.
- People share dishes with family through Messenger, so a recipe can be shared as a picture.

## Capabilities and Constraints

- **Features:** Browse and search dishes, DA price monitoring with week, 2-week and month
  changes, dishes whose cost moved ("Mas mahal na" / "Mas mura na"), the recipe pop-up with
  per-line costs and sources, My Dish (build and price your own dish), the Weekly Planner
  (Random week, the budget planner, Pinakamura ngayon, diet filters, favourites), the "Anong
  lulutuin?" ingredient finder with an ingredient → dish graph, price alerts (on the device),
  share as a picture, a first-time tour, and how-to-cook video links.
- **Stack:** a static site in `docs/` (plain HTML, Tailwind CDN, classic browser scripts sharing
  one global scope, no build step) deployed to GitHub Pages. It calls a Next.js API on Vercel.
  See `CLAUDE.md` for the script order and naming rules.
- **Terms:** ulam, sulit, Sulit Score, sulit meter, palengke, Almusal / Tanghalian · Hapunan /
  Meryenda, gulay / isda / karne, "≈" (derived price), "⚠ Incomplete price".
- **Pricing honesty is structural:** derived prices are shown as "≈". Dishes with a big unpriced
  share are flagged "⚠ Incomplete price" and ranked last. Recipes with unknown ingredients are
  hidden, never deleted.
- **Performance:** the site must stay light and fast on cheap phones and mobile data, with
  touch-sized controls (there is a bottom tab bar on phones).
- **Limits:** price alerts only run while the site is open (there is no push server). The local
  preview calls the live API.

## Brand Commitments

- **Name:** the app is **SarapSulit**, a sub-project of **FARM2FIGURE** (the owner's umbrella
  brand). The site uses the FARM2FIGURE logo and colours, but the app keeps the name SarapSulit
  (browser title, outreach letters). The tagline "Masarap, masustansya, sulit." stays.
- **Logo:** `docs/logo.png` and `docs/favicon.png`.
- **Voice:** Taglish, the way people talk in Manila every day. It is warm and practical, not
  formal, not translated, and never sounds like a government notice. Examples already on the
  site: "Anong ulam ngayon?", "Anong lulutuin?", "Pinakamura ngayon", "Paano gamitin?".

## Evidence on Hand

- Live data: about 2,031 Panlasang Pinoy meals. 1,628 (80%) were fully priced and 94% of
  ingredient lines priced, as last measured on 2026-10-16. 23 dishes are flagged incomplete and
  96 are hidden.
- Sources credited on the site: DA price index, PSA OpenSTAT, SM Markets, DTI SRP, FNRI Food
  Composition Table, USDA, Panlasang Pinoy, Open-Meteo.
- **None on hand:** user testimonials, usage numbers, press or endorsements. Validation talks
  with institutions are under way but nothing has been confirmed for public use. Do not invent
  or imply any of these.

## Product Principles

1. **Honest prices first.** Never hide a source, a "≈" estimate or a "⚠ Incomplete price" flag
   to make a page look cleaner. A guessed price is never shown as a real one.
2. **Built for the cheap phone.** If it is slow or fiddly on a low-end Android phone on mobile
   data, it is not done.
3. **Speak like the user.** Taglish, everyday words, never formal or translated.
4. **Health is guidance, not advice.** Diet filters and nutrition numbers stay labelled as
   guidance only.
5. **End in a decision.** Every surface should help the cook pick something to cook or buy.

## Accessibility & Inclusion

- Mobile-first, with large tap targets and readable text on small screens.
- Light and dark modes are both supported. The weather changes the look (a blue rainy theme), so
  contrast must hold in every theme.
- Copy uses plain everyday language for readers with any level of schooling.
