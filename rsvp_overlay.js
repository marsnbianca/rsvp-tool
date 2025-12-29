// rsvp-overlay.js — modal iframe loader (loads GitHub Pages frontend)
(function () {
  // FRONTEND_URL: set to your GitHub Pages frontend (the RSVP UI hosted on GitHub Pages)
  var FRONTEND_URL = "https://marsnbianca.github.io/rsvp-tool/";
  var PARENT_ORIGIN = "https://marsnbianca.github.io";

  console.log("rsvp-overlay: starting. FRONTEND_URL=", FRONTEND_URL);

  var host = document.getElementById("rsvpHostOverlay");
  if (!host) {
    host = document.createElement("div");
    host.id = "rsvpHostOverlay";
    document.body.appendChild(host);
    console.log("rsvp-overlay: created host element");
  } else {
    console.log("rsvp-overlay: found existing host element");
  }

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

    // create iframe that loads GitHub Pages frontend
    iframe = document.createElement("iframe");
    iframe.src = FRONTEND_URL + (FRONTEND_URL.indexOf('?') === -1 ? '?t=' + Date.now() : '&t=' + Date.now());
    iframe.style.position = "absolute";
    iframe.style.inset = "0";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.background = "transparent";
    iframe.setAttribute("title", "RSVP");

    // simple loader while iframe loads
    var loader = document.createElement("div");
    loader.textContent = "Loading RSVP...";
    loader.style.position = "absolute";
    loader.style.zIndex = "1000000";
    loader.style.left = "50%";
    loader.style.top = "50%";
    loader.style.transform = "translate(-50%, -50%)";
    loader.style.background = "#fff";
    loader.style.padding = "12px 16px";
    loader.style.borderRadius = "8px";
    loader.style.boxShadow = "0 10px 30px rgba(0,0,0,0.12)";

    host.appendChild(loader);
    host.appendChild(iframe);

    lockScroll(true);
    console.log("rsvp-overlay: iframe inserted, src=", iframe.src);

    var loaded = false;
    iframe.onload = function () {
      loaded = true;
      console.log("rsvp-overlay: iframe onload fired — content loaded.");
      try { loader.parentNode && loader.parentNode.removeChild(loader); } catch (_) {}
    };

    // fallback: if iframe doesn't load in 3s, log and open frontend in a new tab
    setTimeout(function () {
      if (!loaded) {
        console.warn("rsvp-overlay: iframe did not load within timeout. Opening frontend in new tab as fallback.");
        try { window.open(iframe.src, "_blank"); } catch (err) { console.error("rsvp-overlay: popup failed", err); }
      }
    }, 3000);
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

  document.addEventListener("click", function (e) {
    var t = e.target;
    var img = t.closest && t.closest('img[alt="openRSVP"], img[aria-label="openRSVP"], img[title="openRSVP"], button[aria-label="openRSVP"], [data-rsvp="open"]');
    if (img) { console.log("rsvp-overlay: image/button trigger"); openRSVP(e); return; }

    var el = t.closest && t.closest("a, button, div, span");
    if (el) {
      var txt = (el.innerText || el.textContent || "").trim().toLowerCase();
      if (txt === "rsvp") { console.log("rsvp-overlay: text trigger"); openRSVP(e); return; }
    }
  }, true);

  window.addEventListener("message", function (e) {
    if (!e) return;
    if (e.origin !== PARENT_ORIGIN && !e.origin.startsWith("https://marsnbianca.github.io") && !e.origin.startsWith("https://script.googleusercontent.com") && !e.origin.startsWith("https://script.google.com")) {
      console.warn("rsvp-overlay: ignoring message from origin", e.origin);
      return;
    }
    if (e.data === "RSVP:CLOSE") {
      console.log("rsvp-overlay: received RSVP:CLOSE — closing overlay");
      closeRSVP();
    }
  });

  window.addEventListener("keydown", function (e) {
    if (e && e.key === "Escape" && host.style.display === "block") closeRSVP();
  });

  // debug helpers
  window.__rsvp = {
    open: openRSVP,
    close: closeRSVP,
    info: function () { return { FRONTEND_URL: FRONTEND_URL, iframeSrc: iframe ? iframe.src : null, hostVisible: host.style.display === "block" }; }
  };

  console.log("rsvp-overlay: ready. Use window.__rsvp.open() to test.");
})();
