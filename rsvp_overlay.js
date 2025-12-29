// rsvp-overlay.js — modal iframe overlay for wedding-site
(function () {
  // IMPORTANT: set this to your GitHub Pages front-end URL (the RSVP page you published)
  // Example: "https://marsnbianca.github.io/rsvp-tool/"
  var RSVP_URL = "https://marsnbianca.github.io/rsvp-tool/"; // <-- REPLACE with your frontend Pages URL
  var RSVP_ORIGIN = "https://marsnbianca.github.io";

  var host = document.getElementById("rsvpHostOverlay");
  if (!host) {
    host = document.createElement("div");
    host.id = "rsvpHostOverlay";
    // backdrop styles
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "999999";
    host.style.display = "none";
    host.style.pointerEvents = "none";
    host.style.background = "rgba(0,0,0,0.5)";
    host.style.backdropFilter = "blur(3px)";
    document.body.appendChild(host);
  }

  var container = null;
  var iframe = null;
  var lastFocus = null;

  function makeContainer() {
    container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "50%";
    container.style.top = "50%";
    container.style.transform = "translate(-50%, -50%)";
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "center";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.pointerEvents = "none"; // allow backdrop clicks to hit host
    host.appendChild(container);
    return container;
  }

  function lockScroll(lock) {
    if (lock) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
  }

  function openRSVP(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
      try { e.stopPropagation(); } catch(_) {}
    }

    lastFocus = document.activeElement;

    host.style.display = "block";
    host.style.pointerEvents = "auto";

    if (!container) makeContainer();

    // create a centered card to hold the iframe (so click outside closes)
    var card = document.createElement("div");
    card.style.pointerEvents = "auto";
    card.style.width = "min(920px, 96%)";
    card.style.maxWidth = "920px";
    card.style.height = "min(90vh, 780px)";
    card.style.maxHeight = "90vh";
    card.style.background = "transparent";
    card.style.borderRadius = "12px";
    card.style.boxShadow = "0 20px 60px rgba(0,0,0,0.25)";
    card.style.overflow = "hidden";

    iframe = document.createElement("iframe");
    iframe.src = RSVP_URL + (RSVP_URL.indexOf('?') === -1 ? '?t=' + Date.now() : '&t=' + Date.now());
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.setAttribute("title", "RSVP");
    iframe.setAttribute("allowtransparency", "true");

    // clicking backdrop (host) closes; clicking inside card does not
    host.addEventListener("click", function onHostClick(ev){
      if (ev.target === host) {
        closeRSVP();
      }
    }, { once: false });

    card.appendChild(iframe);
    // clear container and append card
    container.innerHTML = "";
    container.appendChild(card);

    lockScroll(true);
    console.log("rsvp-overlay: opened modal ->", iframe.src);
  }

  function closeRSVP() {
    if (container) container.innerHTML = "";
    host.style.display = "none";
    host.style.pointerEvents = "none";
    lockScroll(false);
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (_) {}
    lastFocus = null;
    iframe = null;
    console.log("rsvp-overlay: closed");
  }

  // delegated click to open overlay (matches button/image on wedding site)
  document.addEventListener("click", function (e) {
    var t = e.target;
    var img = t.closest && t.closest('img[alt="openRSVP"], img[aria-label="openRSVP"], img[title="openRSVP"], button[aria-label="openRSVP"], [data-rsvp="open"]');
    if (img) { openRSVP(e); return; }
    var el = t.closest && t.closest("a, button, div, span");
    if (el) {
      var txt = (el.innerText || el.textContent || "").trim().toLowerCase();
      if (txt === "rsvp") { openRSVP(e); return; }
    }
  }, true);

  // listen for close message from iframe
  window.addEventListener("message", function (e) {
    if (!e) return;
    // allow messages from your site and Google domains
    try {
      if (e.origin !== RSVP_ORIGIN && !e.origin.startsWith("https://script.googleusercontent.com") && !e.origin.startsWith("https://script.google.com") && !e.origin.startsWith(RSVP_URL)) {
        console.warn("rsvp-overlay: ignoring message from origin", e.origin);
        return;
      }
    } catch (_) {}
    if (e.data === "RSVP:CLOSE") closeRSVP();
  });

  // ESC closes overlay
  window.addEventListener("keydown", function (e) {
    if (e && e.key === "Escape" && host.style.display === "block") closeRSVP();
  });

  // debug helpers
  window.__rsvp = { open: openRSVP, close: closeRSVP, info: function(){ return { RSVP_URL: RSVP_URL }; } };

  console.log("rsvp-overlay: ready (modal). Use window.__rsvp.open()");
})();
