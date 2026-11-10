// First-time tour: a few quick steps in Taglish that switch tabs and spotlight the part being
// explained. Shown once on a first visit (remembered on the device); the "?" button in the
// header replays it. Uses app.js: showSection, DATA_READY. docs/tour.test.mjs tests the steps.

const TOUR_KEY = "sarapsulit.tour.v1";

const TOUR_STEPS = [
  { section: "home", target: ".hero-band", title: "Hello! 👋 Welcome sa SarapSulit",
    text: "Dito mo makikita kung anong ulam ang masarap, masustansya at sulit, base sa presyo sa palengke ngayon. Limang hakbang lang 'to." },
  { section: "browse", target: "#browse-grid > :first-child", nav: "nav.browse", title: "Recipe",
    text: "Hanapin ang ulam o i-filter by presyo. Yung green na bar? Sulit meter yan: mas maraming green, mas sulit. I-tap ang ulam para makita ang sangkap, presyo at paano lutuin." },
  { section: "prices", target: "#section-prices table", nav: "nav.prices", title: "Presyo",
    text: "Presyo sa palengke ngayon vs last week at last month, at kung ano ang karaniwang mura ngayong buwan. I-tap ang 🔔 para ma-alert ka pag bumaba na ang presyo." },
  { section: "planner", target: "#plan-grid", nav: "nav.planner", title: "Plano",
    text: "I-plan ang buong linggo: 🎲 Random week, budget planner (“₱1,500 para sa 4”) at grocery list. Para sa NGO o paaralan, may “Para sa maramihan” sa ibaba." },
  { section: "home", target: null, title: "Ayan, ready ka na! 🍳",
    text: "Sa “Lulutuin”, piliin ang meron ka at lalabas ang kaya mong lutuin. Nasa ⚙️ sa taas ang Settings: wika, diet, kusina at dark mode. Pindutin ang “?” para ulitin 'tong tour." },
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
  if (typeof dlgOpen === "function") dlgOpen(document.querySelector("#tour .tour-card"), endTour);
}

function endTour() {
  tourStep = -1;
  document.querySelectorAll(".tour-lit").forEach((x) => x.classList.remove("tour-lit"));
  tourLit = null;
  document.getElementById("tour").classList.add("hidden");
  if (typeof dlgClose === "function") dlgClose(document.querySelector("#tour .tour-card"));
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
  // Section steps use the menu's own label, so the tour and the tabs always match.
  document.getElementById("tour-title").textContent = step.nav && typeof t === "function" ? t(step.nav) : step.title;
  document.getElementById("tour-text").textContent = step.text;
  document.getElementById("tour-count").textContent = `${tourStep + 1} / ${TOUR_STEPS.length}`;
  document.getElementById("tour-back").classList.toggle("invisible", tourStep === 0);
  document.getElementById("tour-next").textContent = tourStep === TOUR_STEPS.length - 1 ? "Tara, simulan na!" : (typeof t === "function" ? t("tour.next") : "Next →");
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
  // After the first-visit age question (settings.js) is answered.
  const go = () => (typeof ageDialogOpen === "function" && ageDialogOpen() ? setTimeout(go, 500)
    : typeof DATA_READY !== "undefined" && DATA_READY ? DATA_READY.then(() => setTimeout(startTour, 600), () => {}) : setTimeout(go, 500));
  setTimeout(go, 0);
})();
