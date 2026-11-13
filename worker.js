// Cloudflare Worker — RSVP proxy
// Reads secrets from environment variables (see deployment notes at bottom).

// In-memory rate limit for lookup (resets per isolate — see notes for Cloudflare dashboard rule).
const lookupHits = new Map(); // ip -> { count, resetAt }

function checkLookupRate(ip) {
  const now = Date.now();
  const WINDOW = 60_000; // 1 minute
  const LIMIT = 10;
  let e = lookupHits.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + WINDOW }; lookupHits.set(ip, e); }
  e.count++;
  return e.count <= LIMIT;
}

const ACTIONS = ["lookup", "submit"];
const MAX_BODY = 8192; // 8 KB

export default {
  async fetch(request, env) {
    const APPS_SCRIPT_EXEC = env.APPS_SCRIPT_EXEC || "";
    const RSVP_SECRET     = env.RSVP_SECRET     || "";
    // ALLOWED_ORIGINS: comma-separated list of allowed origins.
    // Set as a Cloudflare env var (see notes). Default covers GitHub Pages.
    const ALLOWED = env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
      : ["https://marsnbianca.github.io"];

    const origin  = request.headers.get("Origin") || "";
    const allowed = ALLOWED.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin":  allowed ? origin : ALLOWED[0],
      "Vary":                         "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST")    return json({ ok: true, msg: "RSVP proxy is running." });
    if (!allowed)                      return json({ ok: false, error: "Not allowed." }, 403);

    // Size cap
    const cl = parseInt(request.headers.get("content-length") || "0", 10);
    if (cl > MAX_BODY) return json({ ok: false, error: "Request too large." }, 413);

    let p = {};
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ ok: false, error: "Request too large." }, 413);
      p = JSON.parse(text);
    } catch (_) {
      return json({ ok: false, error: "Bad request." }, 400);
    }

    if (typeof p !== "object" || p === null) return json({ ok: false, error: "Bad request." }, 400);
    if (!ACTIONS.includes(p.action))         return json({ ok: false, error: "Bad request." }, 400);

    // Rate-limit lookup per IP
    if (p.action === "lookup") {
      const ip = request.headers.get("CF-Connecting-IP") ||
                 request.headers.get("X-Forwarded-For")  || "unknown";
      if (!checkLookupRate(ip)) {
        return json({ ok: false, error: "Easy there. Try again in a minute.", rateLimit: true }, 429);
      }
    }

    // Field validation
    if (p.action === "lookup") {
      if (typeof p.code !== "string" || !p.code.trim() || p.code.length > 40) {
        return json({ ok: false, error: "Bad request." }, 400);
      }
    }

    if (p.action === "submit") {
      const allowedStatuses = ["Attending", "Declined"];
      if (!allowedStatuses.includes(p.status)) return json({ ok: false, error: "Bad request." }, 400);
      if (typeof p.invite_id !== "string" || !p.invite_id.trim() || p.invite_id.length > 40) {
        return json({ ok: false, error: "Bad request." }, 400);
      }
      if (typeof p.attending_count !== "number" || p.attending_count < 0 || p.attending_count > 20) {
        return json({ ok: false, error: "Bad request." }, 400);
      }
      if (!Array.isArray(p.attendees) || p.attendees.length > 20) {
        return json({ ok: false, error: "Bad request." }, 400);
      }
      for (const name of p.attendees) {
        if (typeof name !== "string" || name.length > 120) return json({ ok: false, error: "Bad request." }, 400);
      }
      if (p.phone !== undefined && typeof p.phone !== "string") return json({ ok: false, error: "Bad request." }, 400);
      if (p.stay !== undefined && p.stay !== "" && !["Balai", "Other"].includes(p.stay)) {
        return json({ ok: false, error: "Bad request." }, 400);
      }
      if (p.transportation !== undefined && p.transportation !== "" && !["Yes", "No"].includes(p.transportation)) {
        return json({ ok: false, error: "Bad request." }, 400);
      }
      const isInt = v => v === undefined || (Number.isInteger(v) && v >= 0 && v <= 20);
      if (!isInt(p.oct14_count) || !isInt(p.oct16_count)) return json({ ok: false, error: "Bad request." }, 400);
    }

    // Strip any unexpected keys — only pass known fields to Apps Script
    const clean = { action: p.action, secret: RSVP_SECRET };
    if (p.action === "lookup") {
      clean.code = String(p.code).trim();
    } else {
      clean.invite_id       = String(p.invite_id).trim();
      clean.status          = p.status;
      clean.attending_count = p.attending_count;
      clean.attendees       = p.attendees;
      clean.phone           = String(p.phone || "");
      clean.stay            = String(p.stay || "");
      clean.transportation  = String(p.transportation || "");
      clean.oct14_count     = p.oct14_count !== undefined ? p.oct14_count : null;
      clean.oct16_count     = p.oct16_count !== undefined ? p.oct16_count : null;
    }

    const resp = await fetch(APPS_SCRIPT_EXEC, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(clean),
    });

    return new Response(await resp.text(), {
      status:  resp.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};

/*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLOUDFLARE ENVIRONMENT VARIABLES — set before deploy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
In the Cloudflare dashboard → Workers & Pages → rsvp-proxy → Settings → Variables:

  APPS_SCRIPT_EXEC   (Secret)  → the Apps Script /exec URL (same value as today)
  RSVP_SECRET        (Secret)  → the shared secret (same value as today)
  ALLOWED_ORIGINS    (Plain)   → comma-separated origins, e.g.:
                                   https://marsnbianca.github.io,https://yourcustomdomain.com

  To add a custom domain later: edit ALLOWED_ORIGINS and add it to the list.
  No code change needed — just update the variable and re-save.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLOUDFLARE RATE-LIMITING RULE (lookup endpoint)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The in-memory counter above resets per isolate; for a durable limit add a
Cloudflare rate-limiting rule:

  1. Dashboard → Security → WAF → Rate limiting rules → Create rule.
  2. Rule name: "RSVP lookup rate limit"
  3. When incoming requests match:
       Field: URI Path  Operator: contains  Value: /  (or your Worker route)
       AND
       Field: Request body  Operator: contains  Value: "action":"lookup"
     (Cloudflare WAF can inspect the body with Enterprise; on free/pro plans,
      match on the Worker route URL alone and set a tighter limit.)
  4. Rate: 10 requests per 1 minute, by IP.
  5. Action: Block (returns 429).
  6. Duration: 1 minute.
  7. Click Deploy.

  Alternative (all plans): use a Cloudflare Turnstile widget on the page, which
  validates humans before they can hit the Worker at all.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*/
