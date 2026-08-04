"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const supabase = createClient();

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMsg({ kind: "error", text: error.message });
    router.replace(next);
    router.refresh();
  }

  async function sendMagicLink() {
    if (!email) return setMsg({ kind: "error", text: "Enter your email first." });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) return setMsg({ kind: "error", text: error.message });
    setMsg({ kind: "info", text: "Check your email for the sign-in link." });
  }

  async function signInGoogle() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setBusy(false);
      setMsg({ kind: "error", text: error.message });
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={signInPassword}>
        <h1>Welcome back</h1>
        <p>Sign in to your family.</p>

        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}

        <button type="submit" disabled={busy || !email || !password}>
          {busy ? "…" : "Sign in"}
        </button>

        <hr className="sep" />

        <div className="row">
          <button type="button" className="ghost" onClick={sendMagicLink} disabled={busy}>
            Email me a link
          </button>
          <button type="button" className="ghost" onClick={signInGoogle} disabled={busy}>
            Google
          </button>
        </div>

        <p style={{ textAlign: "center" }}>
          New here? <Link href="/signup">Create a family</Link>
        </p>
      </form>
    </div>
  );
}
