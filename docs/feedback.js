// "💬 Review or suggest" dialog and the contact details (header button and footer).
// Messages go to the backend (POST /api/feedback, read on /admin); if that fails, the visitor's
// email app opens with the message filled in, so nothing typed is lost.

const FEEDBACK_EMAIL = "jamaigue1@up.edu.ph";
const FEEDBACK_FB_NAME = "John Maigue";
// The owner's Facebook profile link goes here; until then, a Facebook search for the name.
const FEEDBACK_FB_URL = "https://www.facebook.com/search/top?q=John%20Maigue";
const FEEDBACK_KINDS = ["review", "suggestion", "problem"];

let feedbackKind = "review";
let feedbackRating = 0;

/** The request body from the form's fields: trimmed, stars only for a review. */
function feedbackPayload(f) {
  const s = (v, max) => String(v ?? "").trim().slice(0, max);
  const kind = FEEDBACK_KINDS.includes(f.kind) ? f.kind : "suggestion";
  const rating = kind === "review" && f.rating >= 1 && f.rating <= 5 ? Math.round(f.rating) : null;
  return {
    kind, rating, message: s(f.message, 2000), name: s(f.name, 80) || null, contact: s(f.contact, 120) || null,
    page: s(f.page, 40) || null, lang: s(f.lang, 5) || null, website: s(f.website, 200),
  };
}

/** A message can be sent when it says something, or is a review with stars. */
function feedbackReady(p) {
  return p.message.length >= 3 || (p.kind === "review" && p.rating != null);
}

/** mailto: link with the message filled in (the fallback when the backend can't be reached). */
function feedbackMailto(p) {
  const label = { review: "Review", suggestion: "Suggestion", problem: "Problem" }[p.kind];
  const lines = [
    p.rating ? `Rating: ${"★".repeat(p.rating)}${"☆".repeat(5 - p.rating)} (${p.rating}/5)` : null,
    p.message,
    "",
    p.name ? `Name: ${p.name}` : null,
    p.contact ? `Reply to: ${p.contact}` : null,
    p.page ? `Sent from: ${p.page}` : null,
  ].filter((x) => x != null);
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`SarapSulit ${label}`)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

// ── Dialog ──

const fbT = (key) => (typeof t === "function" ? t(key) : key);

function openFeedback(kind = "review") {
  const dlg = document.getElementById("feedback-dialog");
  document.getElementById("feedback-form").reset();
  document.getElementById("feedback-form").classList.remove("hidden");
  document.getElementById("feedback-done").classList.add("hidden");
  document.getElementById("feedback-error").textContent = "";
  feedbackRating = 0;
  setFeedbackKind(kind);
  dlg.showModal();
}

function setFeedbackKind(kind) {
  feedbackKind = FEEDBACK_KINDS.includes(kind) ? kind : "review";
  document.querySelectorAll("[data-fb-kind]").forEach((b) => b.classList.toggle("on", b.dataset.fbKind === feedbackKind));
  document.getElementById("feedback-stars-row").classList.toggle("hidden", feedbackKind !== "review");
  renderFeedbackStars();
}

function setFeedbackRating(n) {
  feedbackRating = feedbackRating === n ? 0 : n;
  renderFeedbackStars();
}

function renderFeedbackStars() {
  document.querySelectorAll("[data-fb-star]").forEach((b) => {
    const on = Number(b.dataset.fbStar) <= feedbackRating;
    b.textContent = on ? "★" : "☆";
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

async function sendFeedback(event) {
  event.preventDefault();
  const form = event.target;
  const err = document.getElementById("feedback-error");
  const visible = document.querySelector('section[id^="section-"]:not(.hidden)');
  const p = feedbackPayload({
    kind: feedbackKind, rating: feedbackRating, message: form.message.value, name: form.fbname.value,
    contact: form.contact.value, website: form.website.value, page: visible?.id.replace(/^section-/, ""), lang: typeof siteLang === "function" ? siteLang() : null,
  });
  if (!feedbackReady(p)) {
    err.textContent = fbT(p.kind === "review" ? "fb.err.empty.review" : "fb.err.empty");
    return;
  }
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  err.textContent = "";
  try {
    const res = await fetch(`${API_BASE}/api/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    if (res.status === 429 || res.status === 400) {
      err.textContent = (await res.json().catch(() => null))?.error ?? fbT("fb.err.later");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    form.classList.add("hidden");
    document.getElementById("feedback-done").classList.remove("hidden");
    if (typeof trackEvent === "function") trackEvent(`feedback/${p.kind}`);
  } catch {
    // The backend is down: hand the message to the visitor's email app instead.
    location.href = feedbackMailto(p);
    err.textContent = `${fbT("fb.err.mail")} ${FEEDBACK_EMAIL}`;
  } finally {
    btn.disabled = false;
  }
}

/** Fills every [data-contact-email] / [data-contact-fb] link with the contact details. */
function renderContactLinks() {
  document.querySelectorAll("[data-contact-email]").forEach((a) => { a.href = `mailto:${FEEDBACK_EMAIL}`; a.textContent = FEEDBACK_EMAIL; });
  document.querySelectorAll("[data-contact-fb]").forEach((a) => { a.href = FEEDBACK_FB_URL; a.textContent = FEEDBACK_FB_NAME; });
}

if (typeof document !== "undefined" && document.readyState) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderContactLinks);
  else renderContactLinks();
}
