# Mars + Bianca — RSVP Tool

Static front end hosted on GitHub Pages. Backend: Cloudflare Worker → Google Apps Script → Google Sheet.

---

## Adding guests to the sheet

The **GuestList** sheet must have these headers in row 1 (order matters for the relationship-fill function; the tool finds all other columns by name):

| Column | Header | Notes |
|--------|--------|-------|
| A | invite_id | Unique code, e.g. `AB12C`. Filled automatically when you type a name. |
| B | invite_name | Household representative's full name. Leave blank on companion rows. |
| C | relationship | Bride's Family · Groom's Family · Bride's Relative · Groom's Relative · Bride's Friend · Groom's Friend · Couple's Friend |
| D | max_seats | Max attendees for this invite (1–n). |
| E | status | Filled by the tool: `Attending` or `Declined`. |
| F | attending_count | Filled by the tool. |
| G | attendee_fullname | Filled by the tool. Companion rows share `invite_id` and have no `invite_name`. |
| H | stay | `Club Balai` or `Other`. Blank for Bride's/Groom's Family. |
| I | oct14_count | Welcome dinner headcount (0–attending_count). |
| J | oct16_count | Farewell lunch headcount (0–attending_count). |
| K | phone | Stored as `09XX XXX XXXX`. |
| L | transportation | `Yes` or `No` (airport interest). Club Balai guests only. |
| M | notes | Free text. |
| N | updated_at | Timestamp, written automatically. |

**To add a new household:** type the name in column B. The `onGuestEdit` trigger auto-fills a unique `invite_id` in column A and stamps `updated_at`.

---

## Deploying Apps Script changes

**Never** create a New Deployment — that changes the URL and breaks the Worker.

1. Open the Apps Script project → **Deploy** → **Manage deployments**.
2. Click the pencil (edit) icon on the active deployment.
3. Change **Version** to **New version**.
4. Click **Deploy**. The URL stays the same.

---

## Deploying Worker changes

1. Set environment variables in Cloudflare dashboard first (Workers & Pages → rsvp-proxy → Settings → Variables):
   - `APPS_SCRIPT_EXEC` *(Secret)* — your Apps Script `/exec` URL
   - `RSVP_SECRET` *(Secret)* — shared secret
   - `ALLOWED_ORIGINS` *(Plain)* — comma-separated, e.g. `https://marsnbianca.github.io`
2. Paste the contents of `worker.js` into the Worker editor (or deploy via Wrangler).
3. Save and deploy.

To add a custom domain later: edit `ALLOWED_ORIGINS` and append the new origin. No code change needed.

---

## Embedding in Readymag

Add a **Code widget** to your Readymag page and paste:

```html
<!-- RSVP tool iframe -->
<iframe
  id="rsvp-frame"
  src="https://marsnbianca.github.io/rsvp-tool/"
  style="width:100%;border:0;display:block;"
  title="RSVP"
  scrolling="no"
></iframe>

<script>
window.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== 'RSVP:HEIGHT') return;
  var frame = document.getElementById('rsvp-frame');
  if (frame) frame.style.height = e.data.height + 'px';
});
</script>
```

The iframe reports its height on every step change and resize. The listener above resizes the widget accordingly.

---

## Dev / preview

- **Preview the branch** before merging to `main`: push the branch to GitHub, then visit `https://marsnbianca.github.io/rsvp-tool/` only after merging. For branch preview, serve locally with `npx serve .` or Python's `python3 -m http.server` and open `index.html`.
- **Dev mode**: append `?dev=1` to the URL. No real network calls are made. Test codes: `TEST01` (solo), `TEST02` (duo), `TEST03` (family, skips stay question), `TEST04` (pre-filled as declined).

---

## Deploy order

1. Apps Script → New version (URL unchanged).
2. Cloudflare Worker → set env vars, then deploy `worker.js`.
3. Front end → merge `feature/redesign-2027` to `main`; GitHub Pages serves it automatically.
