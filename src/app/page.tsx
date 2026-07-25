"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExerciseState, LogWarnings } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  overdue: "Overdue",
  dueSoon: "Due soon",
  ready: "Ready",
  resting: "Resting",
};

const GROUP_ORDER = ["overdue", "dueSoon", "ready", "resting"] as const;

const CATEGORY_EMOJI: Record<string, string> = {
  upper: "💪",
  lower: "🦵",
  impact: "⚡",
  carry: "🧳",
  bone: "🦴",
  core: "🌀",
  cardio: "🏃",
};

const PROGRESS_SUFFIX: Record<string, string> = {
  weight: " lb",
  reps: " reps",
  sets: " sets",
};

const DETAILS_SECONDS = 10;

interface ProgressItem {
  exercise: string;
  kind: string;
  from: string;
  to: string;
}
interface Summary {
  windowDays: number;
  sessions: number;
  activeDays: number;
  progress: ProgressItem[];
  byDay: { date: string; count: number }[];
}

function sinceLabel(s: ExerciseState): string {
  if (s.daysSince === null) return "never done";
  if (s.daysSince === 0) return "today";
  if (s.daysSince === 1) return "yesterday";
  return `${s.daysSince}d ago`;
}

function prescription(s: ExerciseState): string {
  const { sets, reps, weight } = s.config;
  const left = sets && reps ? `${sets} × ${reps}` : reps || sets || "";
  const right = weight ? `${weight} lb` : "";
  return [left, right].filter(Boolean).join(" · ");
}

function lastLabel(s: ExerciseState): string | null {
  if (!s.last) return null;
  const { weight, reps, sets } = s.last;
  const volume =
    sets && reps ? `${sets} × ${reps}` : reps ? `${reps} reps` : sets ? `${sets} sets` : "";
  const parts = [volume, weight ? `${weight} lb` : ""].filter(Boolean);
  const stat = parts.length ? parts.join(" · ") : "done";
  return `last: ${stat} (${sinceLabel(s)})`;
}

interface PendingLog {
  exercise: string;
  warnings: LogWarnings;
}

interface DetailsState {
  id: string;
  exercise: string;
  weight: string;
  reps: string;
  sets: string;
  note: string;
}

export default function Home() {
  const [states, setStates] = useState<ExerciseState[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingLog | null>(null);
  const [details, setDetails] = useState<DetailsState | null>(null);
  const [countdown, setCountdown] = useState(DETAILS_SECONDS);
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/dashboard", { cache: "no-store" });
    const data = await res.json();
    setStates(data.states ?? []);
    setSummary(data.summary ?? null);
    setDisplayName(data.displayName ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh whenever the app regains focus (tab switch, phone unlock), so
  // edits made in the Google Sheet show up without a manual reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // Auto-dismiss countdown for the details prompt. Cancelled the moment the
  // user engages a field (see stopCountdown).
  const stopCountdown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const closeDetails = useCallback(() => {
    stopCountdown();
    setDetails(null);
  }, [stopCountdown]);

  useEffect(() => {
    if (!details) return;
    setCountdown(DETAILS_SECONDS);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          closeDetails();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return stopCountdown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.id]);

  async function startLog(exercise: string) {
    const res = await fetch(`/api/precheck?exercise=${encodeURIComponent(exercise)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    const w: LogWarnings = data.warnings;
    if (w.restWarning || w.weeklyWarning) {
      setPending({ exercise, warnings: w });
    } else {
      await commitLog(exercise);
    }
  }

  // Move the exercise to Resting/Ready immediately, before the server replies.
  function applyOptimistic(exercise: string) {
    setStates((prev) =>
      prev.map((s) =>
        s.exercise === exercise
          ? {
              ...s,
              daysSince: 0,
              lastDone: new Date().toISOString(),
              status: s.config.minRestDays > 0 ? "resting" : "ready",
            }
          : s,
      ),
    );
  }

  async function commitLog(exercise: string) {
    setPending(null);
    const id = crypto.randomUUID();
    const s = states.find((x) => x.exercise === exercise);

    // Snappy feedback: haptic + optimistic move, before the network round-trip.
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
    applyOptimistic(exercise);

    // Open the details prompt right away, prefilled with LAST actuals (so you
    // can beat them), falling back to the recommended prescription.
    setDetails({
      id,
      exercise,
      weight: s?.last?.weight ?? s?.config.weight ?? "",
      reps: s?.last?.reps ?? s?.config.reps ?? "",
      sets: s?.last?.sets ?? s?.config.sets ?? "",
      note: s?.last?.note ?? "",
    });

    // Write (idempotent on id), then reconcile with server truth.
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercise, id }),
    });
    await refresh();
  }

  async function undoLog() {
    if (!details) return;
    const { id } = details;
    closeDetails();
    await fetch(`/api/log?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    showToast("Removed ↩");
    await refresh();
  }

  async function saveDetails() {
    if (!details) return;
    stopCountdown();
    const { id, weight, reps, sets, note } = details;
    setDetails(null);
    await fetch("/api/log", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, weight, reps, sets, note }),
    });
    showToast("Details saved 💾");
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Category chips: All + the categories actually present, in a stable order.
  const presentCats = Array.from(
    new Set(states.map((s) => s.config.category).filter(Boolean) as string[]),
  );
  const catOrder = ["upper", "lower", "impact", "carry", "bone", "core", "cardio"];
  const categories = ["All", ...catOrder.filter((c) => presentCats.includes(c))];

  const visible = states.filter(
    (s) => category === "All" || s.config.category === category,
  );

  const grouped = GROUP_ORDER.map((status) => ({
    status,
    items: visible.filter((s) => s.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <main>
      <header className="app">
        <div>
          <h1>{displayName ? `Hi ${displayName} 👋` : "Today"}</h1>
          <span className="date">{today}</span>
        </div>
      </header>

      {/* Motivation: this-week summary + recent progress wins */}
      {!loading && summary && (summary.sessions > 0 || summary.progress.length > 0) && (
        <div className="summary">
          <div className="summary-top">
            <span className="fire">🔥 {summary.sessions} sessions</span>
            <span className="muted">{summary.activeDays}/7 active days this week</span>
          </div>
          <div className="week-strip">
            {summary.byDay.map((d, i) => {
              const isToday = i === summary.byDay.length - 1;
              const active = d.count > 0;
              return (
                <div key={d.date} className={`day-col${isToday ? " today" : ""}`}>
                  <div className={`day-dot${active ? " active" : ""}`}>
                    {active ? d.count : ""}
                  </div>
                  <div className="day-date">{parseInt(d.date.slice(8), 10)}</div>
                </div>
              );
            })}
          </div>
          {summary.progress.length > 0 && (
            <div className="progress-row">
              {summary.progress.map((p, i) => (
                <span className="progress-chip" key={i}>
                  📈 {p.exercise} {p.from}→{p.to}
                  {PROGRESS_SUFFIX[p.kind] ?? ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && categories.length > 1 && (
        <nav className="chips">
          {categories.map((c) => (
            <button
              key={c}
              className={`chip ${category === c ? "active" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c === "All" ? "All" : `${CATEGORY_EMOJI[c] ?? ""} ${c}`}
            </button>
          ))}
        </nav>
      )}

      {loading && <p className="muted">Loading…</p>}

      {!loading &&
        grouped.map((g) => (
          <section key={g.status}>
            <div className="group-title">
              {STATUS_LABEL[g.status]} ({g.items.length})
            </div>
            {g.items.map((s) => {
              const hasInfo = Boolean(s.config.tip || s.config.link);
              const isOpen = expanded === s.exercise;
              return (
                <div className={`card ${s.status}${isOpen ? " open" : ""}`} key={s.exercise}>
                  <div className="card-row">
                    <div className="emoji">{CATEGORY_EMOJI[s.config.category ?? ""] ?? "•"}</div>
                    <div className="info">
                      <div className="name-row">
                        <span className="name">{s.exercise}</span>
                        {hasInfo && (
                          <button
                            className="info-btn"
                            aria-label={`How to do ${s.exercise}`}
                            aria-expanded={isOpen}
                            onClick={() => setExpanded(isOpen ? null : s.exercise)}
                          >
                            ⓘ
                          </button>
                        )}
                      </div>
                      {lastLabel(s) && <div className="last">{lastLabel(s)}</div>}
                      {s.last?.note ? (
                        <div className="note">{s.last.note}</div>
                      ) : !s.last && s.config.tip ? (
                        <div className="tip">{s.config.tip}</div>
                      ) : null}
                      {prescription(s) && <div className="rx">{prescription(s)}</div>}
                      <div className="meta">
                        <span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span>
                        <span className="since">{sinceLabel(s)}</span>
                      </div>
                    </div>
                    <button className="log" onClick={() => startLog(s.exercise)}>
                      Log
                    </button>
                  </div>
                  {isOpen && (
                    <div className="card-detail">
                      {s.config.tip && <div className="cue">▸ {s.config.tip}</div>}
                      {s.config.link && (
                        <a
                          className="demo"
                          href={s.config.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ▶ Watch demo
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}

      {!loading && grouped.length === 0 && (
        <p className="muted">Nothing in this category.</p>
      )}

      {/* Warning confirm (non-blocking) */}
      {pending && (
        <div className="backdrop" onClick={() => setPending(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            {pending.warnings.messages.map((m, i) => (
              <div className="warn" key={i}>
                ⚠️ {m}
              </div>
            ))}
            <div className="muted">Log it anyway?</div>
            <div className="actions">
              <button className="cancel" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button className="confirm" onClick={() => commitLog(pending.exercise)}>
                Log anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Optional details prompt — auto-dismisses if untouched */}
      {details && (
        <div className="details-bar">
          <div className="details-head">
            <span>
              <strong>{details.exercise}</strong> logged ✓ ·{" "}
              <button className="undo" onClick={undoLog}>
                Undo
              </button>
            </span>
            <span className="count">closing in {countdown}s</span>
          </div>
          <div className="details-fields" onFocusCapture={stopCountdown}>
            <label>
              Weight
              <input
                inputMode="text"
                value={details.weight}
                onChange={(e) => setDetails({ ...details, weight: e.target.value })}
              />
            </label>
            <label>
              Reps
              <input
                inputMode="text"
                value={details.reps}
                onChange={(e) => setDetails({ ...details, reps: e.target.value })}
              />
            </label>
            <label>
              Sets
              <input
                inputMode="text"
                value={details.sets}
                onChange={(e) => setDetails({ ...details, sets: e.target.value })}
              />
            </label>
          </div>
          <div className="details-note" onFocusCapture={stopCountdown}>
            <label>
              Note
              <input
                inputMode="text"
                placeholder="optional"
                value={details.note}
                onChange={(e) => setDetails({ ...details, note: e.target.value })}
              />
            </label>
          </div>
          <div className="details-actions">
            <button className="cancel" onClick={closeDetails}>
              Close now
            </button>
            <button className="confirm" onClick={saveDetails}>
              Save
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
