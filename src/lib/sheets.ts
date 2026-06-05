// Google Sheets provider (service account). The single source of truth.
// Config is parsed by HEADER NAME so forkers can reorder/rename columns
// without breaking. The log tab keeps a fixed column order (app-managed).

import { google } from "googleapis";
import type { ExerciseConfig, LogEntry, Meta } from "./types";

const SA_KEY = process.env.GOOGLE_SA_KEY;

/** Accept a bare id or a full Google Sheets URL; extract the id. */
export function sheetId(): string {
  const raw = (process.env.SHEET_ID ?? "").trim();
  const m = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : raw;
}

export function hasServiceAccount(): boolean {
  return Boolean(sheetId() && SA_KEY);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Parse GOOGLE_SA_KEY: base64-encoded JSON or raw JSON; normalize \n keys. */
export function parseCreds(): { client_email: string; private_key: string } {
  const raw = (SA_KEY as string).trim();
  const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const creds = JSON.parse(text);
  if (!creds.client_email || !creds.private_key) {
    throw new Error("GOOGLE_SA_KEY is missing client_email or private_key");
  }
  creds.private_key = String(creds.private_key).replace(/\\n/g, "\n");
  return creds;
}

function sheetsClient() {
  const creds = parseCreds();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown) => (v !== undefined && v !== "" ? String(v) : undefined);

// --- Reads -----------------------------------------------------------------

async function getConfig(): Promise<ExerciseConfig[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: "config!A1:Z",
  });
  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  // Map header name -> column index (header-based, order-independent).
  const headers = rows[0].map(norm);
  const col = (name: string) => headers.indexOf(name);
  const idx = {
    name: col("name"),
    minRestDays: col("minrestdays"),
    overdueDays: col("overduedays"),
    weeklyOnly: col("weeklyonly"),
    unit: col("unit"),
    category: col("category"),
    active: col("active"),
    sets: col("sets"),
    reps: col("reps"),
    weight: col("weight"),
    tip: col("tip"),
  };
  const get = (r: unknown[], i: number) => (i >= 0 ? r[i] : undefined);

  return rows
    .slice(1)
    .map((r): ExerciseConfig => ({
      name: String(get(r, idx.name) ?? "").trim(),
      minRestDays: Number(get(r, idx.minRestDays) ?? 1),
      overdueDays: Number(get(r, idx.overdueDays) ?? 5),
      weeklyOnly: String(get(r, idx.weeklyOnly) ?? "").toLowerCase() === "yes",
      unit: str(get(r, idx.unit)),
      category: str(get(r, idx.category)),
      active: String(get(r, idx.active) ?? "yes").toLowerCase() !== "no",
      sets: str(get(r, idx.sets)),
      reps: str(get(r, idx.reps)),
      weight: str(get(r, idx.weight)),
      tip: str(get(r, idx.tip)),
    }))
    .filter((c) => c.name && c.active);
}

async function getLogs(): Promise<LogEntry[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: "log!A2:H",
  });
  const rows = res.data.values ?? [];
  return rows.map((r): LogEntry => ({
    id: String(r[0] ?? ""),
    exercise: String(r[1] ?? ""),
    timestamp: String(r[2] ?? ""),
    date: String(r[3] ?? ""),
    weight: str(r[4]),
    reps: str(r[5]),
    sets: str(r[6]),
    note: str(r[7]),
  }));
}

const META_KEYS = new Set(["timezone", "schemaversion", "displayname"]);

async function getMeta(): Promise<Meta> {
  try {
    const sheets = sheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: "meta!A1:Z",
    });
    const rows = res.data.values ?? [];
    const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

    // Tolerate vertical (key|value per row) OR horizontal (headers/values) layout.
    const verticalHits = rows.filter((r) => META_KEYS.has(lower(r[0]))).length;
    const horizontalHits = (rows[0] ?? []).filter((c) => META_KEYS.has(lower(c))).length;

    const map: Record<string, string> = {};
    if (verticalHits >= horizontalHits) {
      for (const r of rows) {
        const k = lower(r[0]);
        if (k) map[k] = r[1] !== undefined ? String(r[1]).trim() : "";
      }
    } else {
      const [hdr = [], val = []] = rows;
      hdr.forEach((h, i) => {
        map[lower(h)] = val[i] !== undefined ? String(val[i]).trim() : "";
      });
    }
    const tz = map["timezone"];
    return {
      displayName: map["displayname"] || undefined,
      timezone: tz && isValidTimeZone(tz) ? tz : undefined,
    };
  } catch {
    return {};
  }
}

// --- Writes ----------------------------------------------------------------

async function appendLog(entry: LogEntry): Promise<void> {
  const existing = await getLogs();
  if (existing.some((e) => e.id === entry.id)) return; // idempotent retry

  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range: "log!A:H",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        entry.id, entry.exercise, entry.timestamp, entry.date,
        entry.weight ?? "", entry.reps ?? "", entry.sets ?? "", entry.note ?? "",
      ]],
    },
  });
}

async function updateLogDetails(
  id: string,
  details: { weight?: string; reps?: string; sets?: string },
): Promise<boolean> {
  const sheets = sheetsClient();
  const idCol = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: "log!A2:A",
  });
  const ids = (idCol.data.values ?? []).map((r) => String(r[0] ?? ""));
  const i = ids.indexOf(id);
  if (i === -1) return false;
  const row = i + 2;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `log!E${row}:G${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[details.weight ?? "", details.reps ?? "", details.sets ?? ""]] },
  });
  return true;
}

async function deleteLogRow(id: string): Promise<boolean> {
  const sheets = sheetsClient();
  const ssm = await sheets.spreadsheets.get({
    spreadsheetId: sheetId(),
    fields: "sheets.properties(sheetId,title)",
  });
  const gid = (ssm.data.sheets ?? []).find((s) => s.properties?.title === "log")?.properties?.sheetId;
  if (gid == null) return false;

  const idCol = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: "log!A2:A",
  });
  const ids = (idCol.data.values ?? []).map((r) => String(r[0] ?? ""));
  const i = ids.indexOf(id);
  if (i === -1) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId(),
    requestBody: {
      requests: [
        { deleteDimension: { range: { sheetId: gid, dimension: "ROWS", startIndex: i + 1, endIndex: i + 2 } } },
      ],
    },
  });
  return true;
}

export const sheetsProvider = {
  getConfig, getLogs, getMeta, appendLog, updateLogDetails, deleteLogRow,
};
