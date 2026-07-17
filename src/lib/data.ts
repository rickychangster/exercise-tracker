// Data facade — picks a backend provider based on environment:
//   APPS_SCRIPT_URL set           -> Apps Script (no Google Cloud needed)
//   SHEET_ID + GOOGLE_SA_KEY set  -> Google Sheets via service account
//   neither                       -> in-memory mock (demo mode)
//
// Routes import ONLY from this file, so swapping backends needs no route changes.

import { appsScriptProvider, hasAppsScript } from "./appsscript";
import { mockProvider } from "./mock";
import { hasServiceAccount, sheetsProvider } from "./sheets";

export type DataMode = "appsscript" | "sheets" | "mock";

export function dataMode(): DataMode {
  if (hasAppsScript()) return "appsscript";
  if (hasServiceAccount()) return "sheets";
  return "mock";
}

function provider() {
  switch (dataMode()) {
    case "appsscript":
      return appsScriptProvider;
    case "sheets":
      return sheetsProvider;
    default:
      return mockProvider;
  }
}

export function appTimezone(): string {
  return process.env.APP_TIMEZONE || "America/Los_Angeles";
}

export const getConfig = () => provider().getConfig();
export const getLogs = () => provider().getLogs();
export const getMeta = () => provider().getMeta();
export const appendLog = (entry: Parameters<typeof sheetsProvider.appendLog>[0]) =>
  provider().appendLog(entry);
export const updateLogDetails = (
  id: string,
  details: { weight?: string; reps?: string; sets?: string; note?: string },
) => provider().updateLogDetails(id, details);
export const deleteLogRow = (id: string) => provider().deleteLogRow(id);
