<script>
(function () {
  var RSVP_ORIGIN = "https://marsnbianca.github.io";
  var RSVP_URL = RSVP_ORIGIN + "/rsvp/";

  var host = document.createElement("div");
  host.id = "rsvpHostOverlay";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "999999";
  host.style.background = "transparent";
  host.style.display = "none";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);

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
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    lastFocus = document.activeElement;

    host.innerHTML = "";
    host.style.display = "block";
    host.style.pointerEvents = "auto";
    host.style.background = "transparent";

    iframe = document.createElement("iframe");
    iframe.src = RSVP_URL + "?t=" + Date.now();
    iframe.style.position = "absolute";
    iframe.style.inset = "0";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.background = "transparent";
    iframe.setAttribute("allowtransparency", "true");
    iframe.setAttribute("title", "RSVP");

    host.appendChild(iframe);
    lockScroll(true);
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
  }

  // ONE reliable RSVP trigger for Readymag
  document.addEventListener("click", function (e) {
    var t = e.target;

    // 1) Image-based trigger (set Alt Text of your picture to openRSVP)
    var img = t.closest && t.closest('img[alt="openRSVP"], img[aria-label="openRSVP"], img[title="openRSVP"]');
    if (img) {
      openRSVP(e);
      return;
    }

    // 2) Text-based trigger fallback ("RSVP")
    var el = t.closest && t.closest("a, button, div, span");
    if (el) {
      var txt = (el.innerText || el.textContent || "").trim().toLowerCase();
      if (txt === "rsvp") {
        openRSVP(e);
        return;
      }
    }
  }, true);

  window.addEventListener("message", function (e) {
    if (!e) return;
    if (e.origin !== RSVP_ORIGIN) return;
    if (e.data === "RSVP:CLOSE") closeRSVP();
  });

  window.addEventListener("keydown", function (e) {
    if (e && e.key === "Escape" && host.style.display === "block") closeRSVP();
  });
})();
</script>
