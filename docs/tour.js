// First-time tour: a few quick steps in Taglish that switch tabs and spotlight the part being
// explained. Shown once on a first visit (remembered on the device); the "?" button in the
// header replays it. Uses app.js: showSection, DATA_READY. docs/tour.test.mjs tests the steps.

const TOUR_KEY = "sarapsulit.tour.v1";

const TOUR_STEPS = [
  { section: "home", target: ".hero-band", title: "Hello! 👋 Welcome sa FARM2FIGURE",
    text: "Dito mo makikita kung anong ulam ang masarap, masustansya at sulit, base sa presyo sa palengke ngayon. Mabilis lang 'to, promise." },
  { section: "home", target: ".hero-search", title: "Hanap ng ulam",
    text: "Type mo lang yung gusto mo, e.g. adobo o sinigang, tapos Search." },
  { section: "home", target: "#weather-grid", title: "Pang-panahon na picks",
    text: "Depende sa weather yung suggestion: pag maulan, mainit na sabaw; pag maaraw, pampalamig. Pwede mo ring palitan." },
  { section: "browse", target: "#browse-grid", title: "Browse Recipes",
    text: "I-filter mo by presyo, protein o calories. Yung green na bar? Sulit meter yan: mas maraming green, mas sulit. I-tap ang dish para makita ang ingredients, presyo at paano lutuin." },
  { section: "prices", target: "#section-prices table", title: "DA Prices",
    text: "Presyo ngayon vs last week, 2 weeks at last month. I-tap ang 🔔 para ma-alert ka pag bumaba na yung presyo." },
  { section: "browse", target: ".kitchen-bar", title: "Ang kusina ko 🍳",
    text: "Walang oven? I-tap ang “Ang kusina ko” at piliin ang mga gamit mo (air fryer, rice cooker, ihawan…). Itatago namin ang mga ulam na hindi mo kayang lutuin." },
  { section: "planner", target: "#plan-grid", title: "Weekly Planner",
    text: "I-plan ang buong linggo: i-drag ang ulam sa slot (sa phone, pindutin nang matagal). May 🎲 Random week, Budget planner (“₱1,500 for 4 people”) at grocery list per palengke section." },
  { section: "finder", target: "#finder-cats", title: "Anong lulutuin?",
    text: "Piliin mo lang yung meron ka sa ref o kusina, lalabas yung mga pwede mong lutuin at kung ano pa ang kulang." },
  { section: "game", target: ".game-tabs", title: "Laro tayo! 🎮",
    text: "I-rate ang ulam o pumili sa Versus (Sinigang vs Adobo?). Habang naglalaro ka, natututunan namin ang panlasa mo, tapos sa Recipes, uunahin na ang mga ulam na “bagay sa'yo”." },
  { section: "home", target: null, title: "Ayan, ready ka na! 🍳",
    text: "Nasa ⚙️ sa taas ang Settings: English o Tagalog, diet (pwedeng marami), kusina, dark mode at weather. Pindutin ang “?” para ulitin 'tong tour." },
];

// ── Pure helpers ──

/** Whether to start the tour by itself: first visit only, and not when a shared recipe link opens. */
function shouldAutoTour(storage, hash) {
  if (/^#recipe=\d+$/.test(hash || "")) return false;
  try { return !storage.getItem(TOUR_KEY); } catch { return false; }
}

function markTourDone(storage) {
  try { storage.setItem(TOUR_KEY, new Date().toISOString()); } catch { /* not saved */ }
}

// ── Browser side ──

let tourStep = -1;
let tourLit = null;

function tourStore() {
  try { return window.localStorage; } catch { return null; }
}

function startTour() {
  tourStep = 0;
  document.getElementById("tour").classList.remove("hidden");
  showTourStep();
}

function endTour() {
  tourStep = -1;
  document.querySelectorAll(".tour-lit").forEach((x) => x.classList.remove("tour-lit"));
  tourLit = null;
  document.getElementById("tour").classList.add("hidden");
  const s = tourStore();
  if (s) markTourDone(s);
  showSection("home");
}

function tourNext(delta = 1) {
  const n = tourStep + delta;
  if (n < 0) return;
  if (n >= TOUR_STEPS.length) { endTour(); return; }
  tourStep = n;
  showTourStep();
}

function showTourStep() {
  const step = TOUR_STEPS[tourStep];
  if (tourLit) { tourLit.classList.remove("tour-lit"); tourLit = null; }
  showSection(step.section);
  document.getElementById("tour-title").textContent = step.title;
  document.getElementById("tour-text").textContent = step.text;
  document.getElementById("tour-count").textContent = `${tourStep + 1} / ${TOUR_STEPS.length}`;
  document.getElementById("tour-back").classList.toggle("invisible", tourStep === 0);
  document.getElementById("tour-next").textContent = tourStep === TOUR_STEPS.length - 1 ? "Tara, simulan na!" : "Next →";
  document.getElementById("tour-dots").innerHTML = TOUR_STEPS.map((_, i) => `<i class="${i === tourStep ? "on" : ""}"></i>`).join("");
  // Spotlight the part being explained, once the tab has drawn (skipped if the user moved on).
  const at = tourStep;
  setTimeout(() => {
    if (at !== tourStep) return;
    document.querySelectorAll(".tour-lit").forEach((x) => x.classList.remove("tour-lit"));
    const el = step.target ? document.querySelector(step.target) : null;
    document.getElementById("tour").classList.toggle("dim", !el);
    if (!el) return;
    el.classList.add("tour-lit");
    tourLit = el;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 250);
}

// First visit: start once the recipes are in, so every tab has something to show.
(function autoTour() {
  if (typeof window === "undefined" || !window.document) return;
  const s = tourStore();
  if (!s || !shouldAutoTour(s, window.location.hash)) return;
  const go = () => (typeof DATA_READY !== "undefined" && DATA_READY ? DATA_READY.then(() => setTimeout(startTour, 600), () => {}) : setTimeout(go, 500));
  setTimeout(go, 0);
})();
