// Apps Script backend — Mars & Bianca RSVP tool
// Deploy as: Manage deployments → pencil → New version (keeps existing URL).
// Never create a "New deployment" — that changes the URL.

// Set SPREADSHEET_ID in Project Properties (gear icon → Script properties).
var SPREADSHEET_ID =
  PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || "";
var RSVP_SECRET =
  PropertiesService.getScriptProperties().getProperty("RSVP_SECRET") || "";
var SHEET_NAME      = "GuestList";
var TIMESTAMP_FORMAT = "MM/dd/yyyy HH:mm:ss";

// Reply deadline: March 30 2027, 11:59 PM Philippine Standard Time (UTC+8).
// Change this string if the deadline shifts. Format: ISO 8601 with offset.
var REPLY_DEADLINE = new Date("2027-03-30T23:59:59+08:00");

var RL_SUBMIT_COOLDOWN_SEC = 20;

// ── Entry point ───────────────────────────────────────────────────────────────

function doGet() {
  return HtmlService.createHtmlOutput("<p>RSVP backend is running.</p>")
    .setTitle("RSVP")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    var data = JSON.parse(body || "{}");

    if (isHoneypotTripped_(data)) return json_({ ok: false, error: "Bad request." });

    if (RSVP_SECRET) {
      if (!data.secret || String(data.secret) !== String(RSVP_SECRET)) {
        return json_({ ok: false, error: "Unauthorized." });
      }
    }

    var action = String(data.action || "").trim();
    if (action === "lookup") return json_(lookup_(data));
    if (action === "submit") return json_(submit_(data));

    return json_({ ok: false, error: "Unknown action." });
  } catch (err) {
    console.error("doPost error:", safeErr_(err));
    return json_({ ok: false, error: "Server error. Please try again." });
  }
}

// ── lookup ────────────────────────────────────────────────────────────────────
// Returns what the front end needs; nothing else from the sheet.
// Timing note: always does the full sheet lookup before returning, so an
// unknown code takes the same path length as a valid one.

function lookup_(data) {
  if (isPastDeadline_()) {
    return { ok: false, closed: true };
  }

  var code = String(data.code || "").trim();
  if (!code) return { ok: false, error: "Code is required." };

  var sheet = openSheet_();
  var map   = indexMap_(sheet);

  requireHeaders_(map, [
    "invite_id", "invite_name", "relationship", "max_seats",
    "status", "attending_count", "attendee_fullname",
    "phone", "transportation", "stay",
    "oct14_count", "oct16_count", "updated_at",
  ]);

  var rowIndex = findInviteRowIndex_(sheet, map, code);
  if (!rowIndex) return { ok: false, error: "Code not found." };

  var row          = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  var inviteName   = String(getCell_(row, map, "invite_name")   || "").trim();
  var relationship = String(getCell_(row, map, "relationship")  || "").trim();
  var maxSeats     = toInt_(getCell_(row, map, "max_seats"), 1);
  var skipStay     = isImmediateFamily_(relationship);

  var existStatus      = String(getCell_(row, map, "status")          || "").trim();
  var existCount       = toInt_(getCell_(row, map, "attending_count"), 0);
  var existPhone       = String(getCell_(row, map, "phone")            || "").trim();
  var existTransport   = String(getCell_(row, map, "transportation")   || "").trim();
  var existStay        = String(getCell_(row, map, "stay")             || "").trim();

  var oct14Raw = getCell_(row, map, "oct14_count");
  var oct16Raw = getCell_(row, map, "oct16_count");
  var existOct14 = (oct14Raw === "" || oct14Raw === null || oct14Raw === undefined) ? null : toInt_(oct14Raw, 0);
  var existOct16 = (oct16Raw === "" || oct16Raw === null || oct16Raw === undefined) ? null : toInt_(oct16Raw, 0);

  var existNames = getAttendeeNames_(sheet, map, rowIndex, code, existCount);

  return {
    ok:          true,
    invite_name: inviteName,
    max_seats:   maxSeats,
    skip_stay:   skipStay,
    deadline:    "March 30, 2027",
    closed:      false,
    existing: {
      status:          existStatus,
      attending_count: existCount,
      attendee_names:  existNames,
      phone:           existPhone,
      transportation:  existTransport,
      stay:            existStay,
      oct14_count:     existOct14,
      oct16_count:     existOct16,
    },
  };
}

// ── submit ────────────────────────────────────────────────────────────────────

function submit_(data) {
  if (isPastDeadline_()) {
    return { ok: false, closed: true };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var sheet = openSheet_();
    var map   = indexMap_(sheet);

    requireHeaders_(map, [
      "invite_id", "invite_name", "max_seats",
      "status", "attending_count", "attendee_fullname",
      "phone", "transportation", "stay",
      "oct14_count", "oct16_count", "updated_at",
    ]);

    var inviteId = String(data.invite_id || "").trim();
    if (!inviteId) return { ok: false, error: "invite_id is required." };

    if (!rateLimitSubmit_(inviteId)) {
      return { ok: false, error: "Please wait a moment and try again." };
    }

    var inviteRowIndex = findInviteRowIndex_(sheet, map, inviteId);
    if (!inviteRowIndex) return { ok: false, error: "Invite not found." };

    var inviteRow = sheet.getRange(inviteRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    var maxSeats  = Math.max(1, toInt_(getCell_(inviteRow, map, "max_seats"), 1));
    var relationship = String(getCell_(inviteRow, map, "relationship") || "").trim();

    var status = String(data.status || "").trim();
    if (status !== "Attending" && status !== "Declined") return { ok: false, error: "Invalid status." };

    var attendingCount = 0;
    var attendees      = [];
    var phoneStored    = "";
    var stay           = "";
    var transportation = "";
    var oct14Count     = 0;
    var oct16Count     = 0;

    if (status === "Attending") {
      var rawAttendees = Array.isArray(data.attendees) ? data.attendees : [];
      for (var i = 0; i < rawAttendees.length; i++) {
        var nm = titleCaseName_(String(rawAttendees[i] || ""));
        if (nm) attendees.push(nm);
      }
      if (attendees.length < 1) return { ok: false, error: "Attendee name is required." };

      attendingCount = Math.max(1, Math.min(
        toInt_(data.attending_count, attendees.length),
        attendees.length,
        maxSeats
      ));
      attendees = attendees.slice(0, attendingCount);

      phoneStored = normalizePhoneToStored_(String(data.phone || ""));
      if (!phoneStored)             return { ok: false, error: "Phone number is required." };
      if (!isValidPhoneStored_(phoneStored)) return { ok: false, error: "Phone number is invalid. Please type 11 digits starting with 09." };

      // stay + transportation
      if (isImmediateFamily_(relationship)) {
        stay           = "Nuuk"; // they stay at Nuuk; airport is automatic
        transportation = "";     // not recorded — family ride is automatic
      } else {
        stay = String(data.stay || "").trim();
        if (stay !== "Balai" && stay !== "Other") return { ok: false, error: "Please choose where you are staying." };
        // transportation: only asked of Club Balai guests (stay="Balai")
        transportation = String(data.transportation || "").trim();
        if (stay === "Balai") {
          if (transportation !== "Yes" && transportation !== "No") transportation = "";
        } else {
          transportation = "";
        }
      }

      // event counts — must be 0..attendingCount
      var rawOct14 = data.oct14_count;
      var rawOct16 = data.oct16_count;
      oct14Count = (rawOct14 === null || rawOct14 === undefined) ? attendingCount : Math.max(0, Math.min(toInt_(rawOct14, 0), attendingCount));
      oct16Count = (rawOct16 === null || rawOct16 === undefined) ? attendingCount : Math.max(0, Math.min(toInt_(rawOct16, 0), attendingCount));
    }

    // Write to sheet (always overwrite — latest submission wins)
    setCell_(sheet, map, inviteRowIndex, "status",          sanitizeCell_(status));
    setCell_(sheet, map, inviteRowIndex, "attending_count", status === "Attending" ? attendingCount : 0);
    setCell_(sheet, map, inviteRowIndex, "phone",           sanitizeCell_(phoneStored));
    setCell_(sheet, map, inviteRowIndex, "stay",            sanitizeCell_(stay));
    setCell_(sheet, map, inviteRowIndex, "transportation",  sanitizeCell_(transportation));
    setCell_(sheet, map, inviteRowIndex, "oct14_count",     status === "Attending" ? oct14Count : 0);
    setCell_(sheet, map, inviteRowIndex, "oct16_count",     status === "Attending" ? oct16Count : 0);
    setCell_(sheet, map, inviteRowIndex, "attendee_fullname",
      status === "Attending" ? sanitizeCell_(attendees[0]) : "");
    stampUpdated_(sheet, map, inviteRowIndex);

    deleteContiguousAttendeeRows_(sheet, map, inviteRowIndex, inviteId);

    if (status === "Attending" && attendees.length > 1) {
      insertAttendeeRows_(sheet, map, inviteRowIndex, inviteId, attendees.slice(1), relationship);
    }

    fillRelationships_();

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPastDeadline_() {
  return new Date() > REPLY_DEADLINE;
}

function isImmediateFamily_(rel) {
  // Tolerant match: trim, lowercase, normalise curly apostrophe.
  var r = String(rel || "")
    .trim()
    .toLowerCase()
    .replace(/\u2019/g, "'") // curly apostrophe → straight
    .replace(/\s+/g, " ");
  return r === "bride's family" || r === "groom's family";
}

function getAttendeeNames_(sheet, map, inviteRowIndex, inviteId, attendingCount) {
  var names = [];
  if (attendingCount < 1) return names;

  var inviteRow  = sheet.getRange(inviteRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  var firstName  = String(getCell_(inviteRow, map, "attendee_fullname") || "").trim();
  if (firstName) names.push(firstName);

  var lastRow = sheet.getLastRow();
  for (var r = inviteRowIndex + 1; r <= lastRow && names.length < attendingCount; r++) {
    var row     = sheet.getRange(r, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rowId   = String(getCell_(row, map, "invite_id")   || "").trim();
    var rowName = String(getCell_(row, map, "invite_name") || "").trim();
    if (rowId !== inviteId || rowName) break;
    var aName = String(getCell_(row, map, "attendee_fullname") || "").trim();
    if (aName) names.push(aName);
  }
  return names;
}

// Guard against formula injection for any string written to the sheet.
function sanitizeCell_(v) {
  var s = String(v === null || v === undefined ? "" : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function deleteContiguousAttendeeRows_(sheet, map, inviteRowIndex, inviteId) {
  var lastRow = sheet.getLastRow();
  if (inviteRowIndex >= lastRow) return;

  var toDelete = [];
  for (var r = inviteRowIndex + 1; r <= lastRow; r++) {
    var row        = sheet.getRange(r, 1, 1, sheet.getLastColumn()).getValues()[0];
    var thisId     = String(getCell_(row, map, "invite_id")   || "").trim();
    var thisName   = String(getCell_(row, map, "invite_name") || "").trim();
    var attendeeName = String(getCell_(row, map, "attendee_fullname") || "").trim();
    if (isInviteRow_(thisId, thisName)) break;
    if (thisId === inviteId && !thisName && !!attendeeName) { toDelete.push(r); continue; }
    break;
  }
  for (var i = toDelete.length - 1; i >= 0; i--) sheet.deleteRow(toDelete[i]);
}

function insertAttendeeRows_(sheet, map, inviteRowIndex, inviteId, attendeeNames, relationship) {
  sheet.insertRowsAfter(inviteRowIndex, attendeeNames.length);
  for (var i = 0; i < attendeeNames.length; i++) {
    var target = inviteRowIndex + 1 + i;
    setCell_(sheet, map, target, "invite_id",        sanitizeCell_(inviteId));
    setCell_(sheet, map, target, "invite_name",      "");
    setCell_(sheet, map, target, "relationship",     sanitizeCell_(relationship || ""));
    setCell_(sheet, map, target, "attendee_fullname",sanitizeCell_(attendeeNames[i]));
    setCell_(sheet, map, target, "status",           "");
    setCell_(sheet, map, target, "attending_count",  "");
    setCell_(sheet, map, target, "phone",            "");
    setCell_(sheet, map, target, "stay",             "");
    setCell_(sheet, map, target, "transportation",   "");
    setCell_(sheet, map, target, "oct14_count",      "");
    setCell_(sheet, map, target, "oct16_count",      "");
    setCell_(sheet, map, target, "updated_at",       "");
  }
}

function isHoneypotTripped_(data) {
  return String((data && data.hp) ? data.hp : "").trim().length > 0;
}

function rateLimitSubmit_(inviteId) {
  var cache = CacheService.getScriptCache();
  var key   = "rl_submit_" + inviteId;
  if (cache.get(key)) return false;
  cache.put(key, "1", RL_SUBMIT_COOLDOWN_SEC);
  return true;
}

function openSheet_() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet not found: " + SHEET_NAME);
  return sheet;
}

function indexMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  for (var c = 0; c < headers.length; c++) {
    var key = String(headers[c] || "").trim().toLowerCase().replace(/\s+/g, "");
    if (key) map[key] = c + 1;
  }
  return map;
}

function requireHeaders_(map, headers) {
  var missing = [];
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).toLowerCase().replace(/\s+/g, "");
    if (!map[h]) missing.push(headers[i]);
  }
  if (missing.length) throw new Error("Missing required header(s): " + missing.join(", "));
}

function getCell_(rowValues, map, header) {
  var col = map[String(header || "").trim().toLowerCase().replace(/\s+/g, "")];
  if (!col) return "";
  return rowValues[col - 1];
}

function setCell_(sheet, map, rowIndex, header, value) {
  var col = map[String(header || "").trim().toLowerCase().replace(/\s+/g, "")];
  if (!col) return;
  sheet.getRange(rowIndex, col).setValue(value);
}

function findInviteRowIndex_(sheet, map, inviteId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var idCol   = map["invite_id"];
  var nameCol = map["invite_name"];
  if (!idCol || !nameCol) throw new Error("Missing required header: invite_id or invite_name");
  var ids   = sheet.getRange(2, idCol,   lastRow - 1, 1).getValues();
  var names = sheet.getRange(2, nameCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim()   !== inviteId) continue;
    if (!String(names[i][0] || "").trim()) continue;
    return 2 + i;
  }
  return null;
}

function isInviteRow_(inviteId, inviteName) {
  return !!String(inviteId || "").trim() && !!String(inviteName || "").trim();
}

function normalizePhoneToStored_(input) {
  var d = String(input || "").replace(/\D+/g, "");
  if (!d) return "";
  if (d.indexOf("63") === 0 && d.length >= 12) d = "0" + d.slice(2);
  if (d.indexOf("9")  === 0 && d.length === 10)  d = "0" + d;
  d = d.slice(0, 11);
  if (!/^09\d{9}$/.test(d)) return "";
  return d.slice(0, 4) + " " + d.slice(4, 7) + " " + d.slice(7, 11);
}

function isValidPhoneStored_(stored) {
  return /^09\d{2}\s\d{3}\s\d{4}$/.test(String(stored || "").trim());
}

function titleCaseName_(s) {
  s = String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!s) return "";
  var out = "";
  var cap = true;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (cap && ch >= "a" && ch <= "z") { out += ch.toUpperCase(); cap = false; }
    else out += ch;
    if (ch === " " || ch === "-" || ch === "'") cap = true;
  }
  return out;
}

function toInt_(v, fallback) {
  var n = parseInt(v, 10);
  return isNaN(n) ? (fallback || 0) : n;
}

function formatTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), TIMESTAMP_FORMAT);
}

function safeErr_(err) {
  try { return err && err.message ? String(err.message) : String(err); } catch (_) { return "Unknown error"; }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function stampUpdated_(sheet, map, rowIndex) {
  var col = map["updated_at"];
  if (!col) return;
  var cell = sheet.getRange(rowIndex, col);
  cell.setNumberFormat("@"); // plain text — keeps the format identical to existing rows
  cell.setValue(formatTimestamp_());
}

// ── Sheet maintenance (unchanged from original) ───────────────────────────────

function usedIds_(sheet, idCol) {
  var used = {}, last = sheet.getLastRow();
  if (last < 2) return used;
  var vals = sheet.getRange(2, idCol, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0] || "").trim();
    if (v) used[v] = true;
  }
  return used;
}

function newInviteId_(used) {
  for (var t = 0; t < 2000; t++) {
    var id = String(Math.floor(Math.random() * 90000) + 10000);
    if (/(\d)\1\1/.test(id)) continue;
    if (!used[id]) { used[id] = true; return id; }
  }
  throw new Error("Could not generate a unique invite_id");
}

// Installed trigger: runs on manual sheet edits.
function onGuestEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    var map = indexMap_(sheet);
    var idCol = map["invite_id"], nameCol = map["invite_name"], updCol = map["updated_at"];
    if (!idCol || !nameCol || !updCol) return;
    var r1 = Math.max(2, e.range.getRow()), r2 = e.range.getLastRow();
    var c1 = e.range.getColumn(), c2 = e.range.getLastColumn();
    if (r2 < r1 || r2 - r1 > 300) return;
    if (c1 === updCol && c2 === updCol) return;
    var n    = r2 - r1 + 1;
    var ids  = sheet.getRange(r1, idCol,   n, 1).getValues();
    var names = sheet.getRange(r1, nameCol, n, 1).getValues();
    var used  = null;
    for (var i = 0; i < n; i++) {
      var row = r1 + i;
      var id  = String(ids[i][0]   || "").trim();
      var nm  = String(names[i][0] || "").trim();
      if (!id && nm) {
        if (!used) used = usedIds_(sheet, idCol);
        id = newInviteId_(used);
        sheet.getRange(row, idCol).setValue(Number(id));
      }
      if (!id) continue;
      stampUpdated_(sheet, map, row);
    }
    fillRelationships_();
  } catch (_) {}
}

// Run once from the script editor to install the edit trigger.
function installEditTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "onGuestEdit") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onGuestEdit")
    .forSpreadsheet(SPREADSHEET_ID)
    .onEdit()
    .create();
}

// Fills relationship column for companion rows from the invite row above.
// Reads columns A-C by position (invite_id=A, invite_name=B, relationship=C)
// — these are always the first three columns per the sheet spec.
function fillRelationships_() {
  var sheet = openSheet_();
  var last  = sheet.getLastRow();
  if (last < 2) return;
  var data    = sheet.getRange(2, 1, last - 1, 3).getValues();
  var lastRel = {};
  for (var i = 0; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    if (!id) continue;
    if (String(data[i][1]).trim()) lastRel[id] = data[i][2];
    else if (!String(data[i][2]).trim() && lastRel[id])
      sheet.getRange(i + 2, 3).setValue(lastRel[id]);
  }
}

function runFillRelationships() { fillRelationships_(); }
