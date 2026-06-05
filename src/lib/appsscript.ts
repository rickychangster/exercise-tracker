// Apps Script provider — talks to a sheet-bound Google Apps Script web app
// (see apps-script/Code.gs). This path needs NO Google Cloud project or
// service account: the script runs as the sheet owner. Easiest onboarding.
//
// Configure with APPS_SCRIPT_URL (the web-app /exec URL) and, optionally,
// APPS_SCRIPT_TOKEN (a shared secret the script checks).

import type { ExerciseConfig, LogEntry, Meta } from "./types";

const URL = () => process.env.APPS_SCRIPT_URL!;
const TOKEN = () => process.env.APPS_SCRIPT_TOKEN ?? "";

export function hasAppsScript(): boolean {
  return Boolean(process.env.APPS_SCRIPT_URL);
}

async function call(params: Record<string, string>): Promise<unknown> {
  const u = new globalThis.URL(URL());
  if (TOKEN()) params.token = TOKEN();
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u.toString(), { method: "GET", cache: "no-store" });
  if (!res.ok) throw new Error(`Apps Script GET ${params.action} failed: ${res.status}`);
  return res.json();
}

async function post(body: Record<string, unknown>): Promise<unknown> {
  const payload = TOKEN() ? { ...body, token: TOKEN() } : body;
  // text/plain avoids a CORS preflight; Apps Script parses the raw body.
  const res = await fetch(URL(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Apps Script POST ${String(body.op)} failed: ${res.status}`);
  return res.json();
}

export const appsScriptProvider = {
  async getConfig(): Promise<ExerciseConfig[]> {
    return (await call({ action: "config" })) as ExerciseConfig[];
  },
  async getLogs(): Promise<LogEntry[]> {
    return (await call({ action: "logs" })) as LogEntry[];
  },
  async getMeta(): Promise<Meta> {
    return (await call({ action: "meta" })) as Meta;
  },
  async appendLog(entry: LogEntry): Promise<void> {
    await post({ op: "append", entry });
  },
  async updateLogDetails(
    id: string,
    details: { weight?: string; reps?: string; sets?: string },
  ): Promise<boolean> {
    const r = (await post({ op: "update", id, details })) as { updated?: boolean };
    return Boolean(r.updated);
  },
  async deleteLogRow(id: string): Promise<boolean> {
    const r = (await post({ op: "delete", id })) as { deleted?: boolean };
    return Boolean(r.deleted);
  },
};
