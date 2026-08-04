"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [familyName, setFamilyName] = useState(params.get("family") ?? "");
  const [hasLocalData, setHasLocalData] = useState(false);
  const [importOnCreate, setImportOnCreate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      setHasLocalData(!!localStorage.getItem("myday.v1"));
    } catch {
      /* localStorage disabled */
    }
  }, []);

  async function createFamily(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    let snapshot: unknown = undefined;
    if (importOnCreate && hasLocalData) {
      try {
        const raw = localStorage.getItem("myday.v1");
        if (raw) {
          snapshot = JSON.parse(raw);
        }
      } catch (err) {
        setBusy(false);
        setMsg(`Import error: ${(err as Error).message}`);
        return;
      }
    }

    const response = await fetch("/api/onboarding/create-family", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        familyName,
        importSnapshot: snapshot,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; warning?: string };

    if (!response.ok || !payload.ok) {
      setBusy(false);
      setMsg(payload.message ?? "We could not create your family space. Please try again in a moment.");
      return;
    }

    try {
      localStorage.removeItem("myday.v1");
      localStorage.removeItem("myday.v1.pin");
      localStorage.removeItem("myday.v1.lang");
    } catch {
      /* localStorage disabled */
    }

    if (payload.warning) {
      setMsg(payload.warning);
      setBusy(false);
      router.replace("/");
      router.refresh();
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={createFamily}>
        <h1>Set up your family</h1>
        <p>Choose a family name so we can open your private home area.</p>

        <label>
          Family name
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="The Smith family"
            required
          />
        </label>

        {hasLocalData ? (
          <label style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={importOnCreate}
              onChange={(e) => setImportOnCreate(e.target.checked)}
            />
            Bring my saved children, tasks, and rewards over from this device
          </label>
        ) : null}

        {msg ? <div className="msg error">{msg}</div> : null}

        <button type="submit" disabled={busy || !familyName}>
          {busy ? "Setting up…" : "Create family"}
        </button>
      </form>
    </div>
  );
}
