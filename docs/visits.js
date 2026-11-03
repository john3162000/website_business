// Counts visitors for SarapSulit (POST /api/visit, read on /admin). The backend keeps a salted hash
// of the IP address (never the address) and the city Vercel derives from it. One visit per browser
// session; nothing is sent when the browser asks not to be tracked (Do Not Track / Global Privacy Control).

const VISIT_KEY = "sarapsulit.visit.sent";

/** Whether this browser lets us count the visit. */
function visitAllowed(nav) {
  if (!nav) return false;
  if (nav.globalPrivacyControl === true) return false;
  if (nav.doNotTrack === "1" || nav.doNotTrack === "yes" || nav.msDoNotTrack === "1") return false;
  return !nav.webdriver;
}

/** The request body: the section the visit started on and the site language. */
function visitPayload(page, lang) {
  return JSON.stringify({ page: String(page || "home").slice(0, 40), lang: lang === "tl" ? "tl" : "en" });
}

function sendVisit() {
  try {
    if (!visitAllowed(navigator) || sessionStorage.getItem(VISIT_KEY)) return;
    sessionStorage.setItem(VISIT_KEY, "1");
  } catch {
    if (!visitAllowed(typeof navigator !== "undefined" ? navigator : null)) return;
  }
  const section = document.querySelector('section[id^="section-"]:not(.hidden)')?.id.replace(/^section-/, "");
  const body = visitPayload(section, typeof siteLang === "function" ? siteLang() : "en");
  const url = `${API_BASE}/api/visit`;
  // text/plain keeps it a simple request (no CORS preflight); the route reads the text as JSON.
  if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return;
  fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

if (typeof window !== "undefined" && typeof document !== "undefined" && document.readyState) {
  // After app.js (API_BASE) has loaded and the first section is shown.
  if (document.readyState === "complete") setTimeout(sendVisit, 0);
  else window.addEventListener("load", () => setTimeout(sendVisit, 0));
}
