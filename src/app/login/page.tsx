"use client";

import { useState } from "react";

export default function Login() {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Incorrect passphrase");
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-emoji">🏋️</div>
        <h1>Exercise Tracker</h1>
        <p className="muted">Enter your passphrase to continue.</p>
        <input
          type="password"
          autoFocus
          placeholder="Passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        {error && <div className="login-error">{error}</div>}
        <button className="confirm" type="submit" disabled={busy || !passphrase}>
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
