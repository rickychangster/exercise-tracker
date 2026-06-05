/**
 * Exercise Tracker — Apps Script backend (no Google Cloud needed).
 *
 * Setup:
 *  1. Open your Google Sheet → Extensions → Apps Script.
 *  2. Paste this whole file into Code.gs, Save.
 *  3. (Optional) Project Settings → Script Properties → add TOKEN = a long
 *     random string. Use the same value as APPS_SCRIPT_TOKEN in the app.
 *  4. Deploy → New deployment → Web app:
 *       Execute as: Me   |   Who has access: Anyone
 *     Copy the /exec URL → set it as APPS_SCRIPT_URL in the app.
 *
 * Tabs expected: `config`, `log`, `meta` (see SETUP.md for columns).
 */

var SS = SpreadsheetApp.getActiveSpreadsheet();

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function checkToken(provided) {
  var t = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (t && provided !== t) throw new Error('unauthorized');
}

function doGet(e) {
  try {
    checkToken(e.parameter.token);
    switch (e.parameter.action) {
      case 'config': return jsonOut(getConfig());
      case 'logs': return jsonOut(getLogs());
      case 'meta': return jsonOut(getMeta());
      default: return jsonOut({ error: 'unknown action' });
    }
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    checkToken(body.token);
    switch (body.op) {
      case 'append': appendLog(body.entry); return jsonOut({ ok: true });
      case 'update': return jsonOut({ updated: updateDetails(body.id, body.details || {}) });
      case 'delete': return jsonOut({ deleted: deleteRow(body.id) });
      default: return jsonOut({ error: 'unknown op' });
    }
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }
function str(v) { return v === undefined || v === '' ? undefined : String(v); }

function getConfig() {
  var values = SS.getSheetByName('config').getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(norm);
  function col(name) { return headers.indexOf(name); }
  var idx = {
    name: col('name'), minRestDays: col('minrestdays'), overdueDays: col('overduedays'),
    weeklyOnly: col('weeklyonly'), unit: col('unit'), category: col('category'),
    active: col('active'), sets: col('sets'), reps: col('reps'), weight: col('weight'), tip: col('tip')
  };
  function g(r, i) { return i >= 0 ? r[i] : undefined; }
  return values.slice(1).map(function (r) {
    return {
      name: String(g(r, idx.name) || '').trim(),
      minRestDays: Number(g(r, idx.minRestDays) || 1),
      overdueDays: Number(g(r, idx.overdueDays) || 5),
      weeklyOnly: String(g(r, idx.weeklyOnly) || '').toLowerCase() === 'yes',
      unit: str(g(r, idx.unit)),
      category: str(g(r, idx.category)),
      active: String(g(r, idx.active) == null ? 'yes' : g(r, idx.active)).toLowerCase() !== 'no',
      sets: str(g(r, idx.sets)), reps: str(g(r, idx.reps)),
      weight: str(g(r, idx.weight)), tip: str(g(r, idx.tip))
    };
  }).filter(function (c) { return c.name && c.active; });
}

function getLogs() {
  var sh = SS.getSheetByName('log');
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, 8).getValues();
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return {
      id: String(r[0]), exercise: String(r[1]),
      timestamp: r[2] instanceof Date ? r[2].toISOString() : String(r[2]),
      date: String(r[3]), weight: str(r[4]), reps: str(r[5]), sets: str(r[6]), note: str(r[7])
    };
  });
}

function getMeta() {
  var sh = SS.getSheetByName('meta');
  if (!sh) return {};
  var values = sh.getDataRange().getValues();
  var KEYS = { timezone: 1, schemaversion: 1, displayname: 1 };
  var verticalHits = values.filter(function (r) { return KEYS[norm(r[0])]; }).length;
  var horizontalHits = (values[0] || []).filter(function (c) { return KEYS[norm(c)]; }).length;
  var map = {};
  if (verticalHits >= horizontalHits) {
    values.forEach(function (r) { var k = norm(r[0]); if (k) map[k] = r[1] == null ? '' : String(r[1]).trim(); });
  } else {
    var hdr = values[0] || [], val = values[1] || [];
    hdr.forEach(function (h, i) { map[norm(h)] = val[i] == null ? '' : String(val[i]).trim(); });
  }
  return { displayName: map.displayname || undefined, timezone: map.timezone || undefined };
}

function appendLog(entry) {
  var sh = SS.getSheetByName('log');
  // Idempotent: skip if id already present.
  var existing = getLogs();
  for (var i = 0; i < existing.length; i++) if (existing[i].id === entry.id) return;
  sh.appendRow([
    entry.id, entry.exercise, entry.timestamp, entry.date,
    entry.weight || '', entry.reps || '', entry.sets || '', entry.note || ''
  ]);
}

function findRowById(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function updateDetails(id, details) {
  var sh = SS.getSheetByName('log');
  var row = findRowById(sh, id);
  if (row === -1) return false;
  sh.getRange(row, 5, 1, 3).setValues([[details.weight || '', details.reps || '', details.sets || '']]);
  return true;
}

function deleteRow(id) {
  var sh = SS.getSheetByName('log');
  var row = findRowById(sh, id);
  if (row === -1) return false;
  sh.deleteRow(row);
  return true;
}
