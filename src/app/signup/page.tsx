"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const supabase = createClient();

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding&family=${encodeURIComponent(familyName)}`,
        data: { pending_family_name: familyName },
      },
    });
    setBusy(false);
    if (error) return setMsg({ kind: "error", text: error.message });
    if (data.session) {
      router.replace(`/onboarding?family=${encodeURIComponent(familyName)}`);
      router.refresh();
      return;
    }
    setMsg({ kind: "info", text: "Check your email to confirm and finish signing in." });
  }

  async function signUpGoogle() {
    if (!familyName) return setMsg({ kind: "error", text: "Tell us your family name first." });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/onboarding&family=${encodeURIComponent(familyName)}`,
      },
    });
    if (error) {
      setBusy(false);
      setMsg({ kind: "error", text: error.message });
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={signUp}>
        <h1>Create your family</h1>
        <p>Your family gets its own private space. Only you can see your children&apos;s data.</p>

        <label>
          Family name
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="The Smiths"
            required
          />
        </label>

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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>

        {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}

        <button type="submit" disabled={busy || !email || !password || !familyName}>
          {busy ? "…" : "Create account"}
        </button>

        <hr className="sep" />

        <button type="button" className="ghost" onClick={signUpGoogle} disabled={busy}>
          Sign up with Google
        </button>

        <p style={{ textAlign: "center" }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
