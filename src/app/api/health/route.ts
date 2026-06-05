import { NextResponse } from "next/server";
import { google } from "googleapis";
import { dataMode } from "@/lib/data";
import { hasServiceAccount, parseCreds, sheetId } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// Diagnostic endpoint (behind the access gate). Reports setup status without
// leaking secrets, to pinpoint backend connection issues.
export async function GET() {
  const mode = dataMode();
  const steps: Record<string, unknown> = { dataMode: mode };

  if (mode === "appsscript") {
    steps.APPS_SCRIPT_URL_present = Boolean(process.env.APPS_SCRIPT_URL);
    steps.note = "Apps Script mode — verify by loading /api/config.";
    return NextResponse.json({ ok: true, steps });
  }

  if (mode === "mock") {
    steps.note = "No backend configured — running on demo (mock) data.";
    return NextResponse.json({ ok: true, steps });
  }

  // service-account mode
  const sid = sheetId();
  steps.SHEET_ID_resolved_len = sid.length;
  steps.GOOGLE_SA_KEY_present = Boolean(process.env.GOOGLE_SA_KEY);

  if (!hasServiceAccount()) {
    return NextResponse.json({ ok: false, stage: "config", steps });
  }

  let creds;
  try {
    creds = parseCreds();
    steps.service_account_email = creds.client_email;
  } catch (e) {
    steps.creds_error = (e as Error).message;
    return NextResponse.json({ ok: false, stage: "parseCreds", steps });
  }

  try {
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sid,
      fields: "properties.title,sheets.properties.title",
    });
    steps.spreadsheet_title = meta.data.properties?.title;
    steps.tabs = (meta.data.sheets ?? []).map((s) => s.properties?.title);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: "config!A2:A" });
    steps.config_rows = (res.data.values ?? []).length;
    return NextResponse.json({ ok: true, steps });
  } catch (e) {
    const err = e as { message?: string; code?: number };
    steps.sheets_error = err.message;
    steps.sheets_code = err.code;
    return NextResponse.json({ ok: false, stage: "sheetsRead", steps });
  }
}
