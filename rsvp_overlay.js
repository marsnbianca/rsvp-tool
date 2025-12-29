// rsvp-overlay-debug.js — paste into wedding-site repo as rsvp-overlay.js (overwrite)
(function () {
  // Set this to your GitHub Pages frontend URL (the RSVP UI hosted on GitHub Pages)
  var FRONTEND_URL = "https://marsnbianca.github.io/rsvp-tool/"; // <- replace if different
  var PARENT_ORIGIN = "https://marsnbianca.github.io";

  console.log("rsvp-overlay: starting (debug). FRONTEND_URL=", FRONTEND_URL);

  // Create host if missing
  var host = document.getElementById("rsvpHostOverlay");
  if (!host) {
    host = document.createElement("div");
    host.id = "rsvpHostOverlay";
    document.body.appendChild(host);
    console.log("rsvp-overlay: created host element");
  } else {
    console.log("rsvp-overlay: found existing host element");
  }

  // basic styles
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "999999";
  host.style.display = "none";
  host.style.pointerEvents = "none";
  host.style.background = "transparent";

  var iframe = null;
  var lastFocus = null;

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
      try { e.stopPropagation(); } catch (_) {}
    }

    try { lastFocus = document.activeElement; } catch (_) {}

    host.innerHTML = "";
    host.style.display = "block";
    host.style.pointerEvents = "auto";
    host.style.background = "rgba(0,0,0,0.35)";

    // visible center loader container to help debugging
    var container = document.createElement("div");
    container.style.position = "absolute";
    container.style.inset = "0";
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "center";

    // iframe
    iframe = document.createElement("iframe");
    iframe.src = FRONTEND_URL + (FRONTEND_URL.indexOf('?') === -1 ? '?t=' + Date.now() : '&t=' + Date.now());
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.background = "#fff";
    iframe.setAttribute("title", "RSVP");

    // show loading indicator (simple)
    var loader = document.createElement("div");
    loader.textContent = "Loading RSVP...";
    loader.style.padding = "1rem 1.2rem";
    loader.style.background = "#fff";
    loader.style.borderRadius = "8px";
    loader.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
    loader.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
    loader.style.fontSize = "1rem";

    container.appendChild(loader);
    host.appendChild(container);
    host.appendChild(iframe);

    lockScroll(true);
    console.log("rsvp-overlay: iframe inserted, src=", iframe.src);

    var loaded = false;

    // onload handler
    iframe.onload = function () {
      loaded = true;
      console.log("rsvp-overlay: iframe onload fired — content appears to have loaded.");
      // remove loader
      try { if (container && container.parentNode) container.parentNode.removeChild(container); } catch(_) {}
    };

    // fallback: if iframe doesn't fire onload in time, open in new tab
    setTimeout(function () {
      if (!loaded) {
        console.warn("rsvp-overlay: iframe did not signal load within timeout. Falling back to opening the frontend in a new tab.");
        // leave host visible for debugging but also open a tab
        try {
          var w = window.open(iframe.src, "_blank");
          if (w) {
            console.log("rsvp-overlay: opened frontend in new tab as fallback.");
          } else {
            console.warn("rsvp-overlay: popup blocked when attempting to open fallback tab.");
          }
        } catch (err) {
          console.error("rsvp-overlay: error opening fallback tab:", err);
        }
      }
    }, 2500); // 2.5s timeout for load
  }

  function closeRSVP() {
    host.innerHTML = "";
    host.style.display = "none";
    host.style.pointerEvents = "none";
    host.style.background = "transparent";
    lockScroll(false);
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (_) {}
    lastFocus = null;
    iframe = null;
    console.log("rsvp-overlay: closed");
  }

  // Delegated click handler + direct triggers
  function onDocClick(e) {
    var t = e.target;
    try {
      var img = t.closest && t.closest('img[alt="openRSVP"], img[aria-label="openRSVP"], img[title="openRSVP"], button[aria-label="openRSVP"], [data-rsvp="open"]');
      if (img) { console.log("rsvp-overlay: trigger by image/button click"); openRSVP(e); return; }

      var el = t.closest && t.closest("a, button, div, span");
      if (el) {
        var txt = (el.innerText || el.textContent || "").trim().toLowerCase();
        if (txt === "rsvp") { console.log("rsvp-overlay: trigger by text element"); openRSVP(e); return; }
      }
    } catch (err) {
      console.error("rsvp-overlay: error in click handler", err);
    }
  }
  document.addEventListener("click", onDocClick, true);

  function attachDirect() {
    var sel = [".rsvp-btn", '[data-rsvp=\"open\"]', 'img[alt=\"openRSVP\"]', 'img[aria-label=\"openRSVP\"]', 'img[title=\"openRSVP\"]', 'button[aria-label=\"openRSVP\"]'].join(",");
    var nodes = document.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) {
      (function (n) {
        if (n.__rsvpAttached) return;
        n.addEventListener("click", function (ev) { console.log("rsvp-overlay: direct handler click"); openRSVP(ev); });
        n.__rsvpAttached = true;
      })(nodes[i]);
    }
    console.log("rsvp-overlay: attached direct handlers to", nodes.length, "elements");
  }
  try { attachDirect(); } catch (_) {}
  document.addEventListener("DOMContentLoaded", attachDirect);

  // Listen for close message
  window.addEventListener("message", function (e) {
    if (!e) return;
    // accept messages from same origin GitHub Pages and script.googleusercontent/script.google.com
    if (e.origin !== PARENT_ORIGIN && !e.origin.startsWith("https://script.googleusercontent.com") && !e.origin.startsWith("https://script.google.com")) {
      console.warn("rsvp-overlay: ignoring message from origin", e.origin);
      return;
    }
    if (e.data === "RSVP:CLOSE") {
      console.log("rsvp-overlay: received RSVP:CLOSE message, closing overlay");
      closeRSVP();
    }
  });

  window.addEventListener("keydown", function (e) {
    if (e && e.key === "Escape" && host.style.display === "block") closeRSVP();
  });

  // debugging helpers
  window.__rsvp = {
    open: openRSVP,
    close: closeRSVP,
    info: function () { return { FRONTEND_URL: FRONTEND_URL, hostExists: !!host, iframeSrc: iframe ? iframe.src : null }; }
  };
  console.log("rsvp-overlay: debug script initialized. Use window.__rsvp.open() to open or check window.__rsvp.info().");
})();
