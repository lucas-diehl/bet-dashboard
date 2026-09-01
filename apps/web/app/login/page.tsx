"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(false);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (r.ok) {
      router.replace(params.get("next") || "/");
      router.refresh();
    } else {
      setErr(true);
      setBusy(false);
      setPw("");
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ width: "min(360px, 92vw)", padding: 22 }}>
      <div className="brand" style={{ marginBottom: 16, fontSize: 19 }}>
        <span className="dot" />
        Bet Hub
      </div>
      <label className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>Password</label>
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        autoFocus
        style={{ width: "100%", marginTop: 6, height: 42, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "0 12px", fontSize: 15 }}
      />
      {err ? <div className="neg" style={{ fontSize: 13, marginTop: 8 }}>Incorrect password.</div> : null}
      <button
        type="submit"
        disabled={busy || !pw}
        className="iconbtn"
        style={{ width: "100%", marginTop: 16, height: 42, justifyContent: "center", background: "var(--accent)", color: "#fff", borderColor: "transparent", opacity: busy || !pw ? 0.6 : 1 }}
      >
        {busy ? "…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: "72vh", display: "grid", placeItems: "center" }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
