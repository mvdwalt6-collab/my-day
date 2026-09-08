"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ChildDraft = {
  name: string;
  av: string;
  color: string;
  colorLite: string;
};

const COLOR_CHOICES = [
  ["#ff9f5c", "#ffe4cc"],
  ["#ff7fb0", "#ffd9e8"],
  ["#34c08a", "#cdeede"],
  ["#8a7ff0", "#e6e2fb"],
  ["#5aa9e6", "#d6ecfb"],
  ["#e6b800", "#fff0bf"],
] as const;
const AVATAR_CHOICES = ["🙂", "🦖", "🐰", "🦁", "🦊", "🐻", "🐱", "🐶", "🦄", "🐸"];

const STEPS = ["Family", "Children", "Parent PIN"] as const;

function blankChild(index: number): ChildDraft {
  const [color, colorLite] = COLOR_CHOICES[index % COLOR_CHOICES.length];
  return { name: "", av: AVATAR_CHOICES[index % AVATAR_CHOICES.length], color, colorLite };
}

export default function OnboardingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [familyName, setFamilyName] = useState(params.get("family") ?? "");
  const [children, setChildren] = useState<ChildDraft[]>([blankChild(0)]);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [hasLocalData] = useState(() => {
    try {
      return !!localStorage.getItem("myday.v1");
    } catch {
      return false;
    }
  });
  const [importOnCreate, setImportOnCreate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const importing = hasLocalData && importOnCreate;
  const namedChildren = children.filter((child) => child.name.trim());
  const pinOk = pin === "" || (/^\d{4}$/.test(pin) && pin === pinConfirm);

  function updateChild(index: number, patch: Partial<ChildDraft>) {
    setChildren((list) => list.map((child, i) => (i === index ? { ...child, ...patch } : child)));
  }

  function next() {
    setMsg(null);
    // When importing, children come from the snapshot — skip that step.
    if (step === 0 && importing) setStep(2);
    else setStep((value) => Math.min(value + 1, STEPS.length - 1));
  }

  function back() {
    setMsg(null);
    if (step === 2 && importing) setStep(0);
    else setStep((value) => Math.max(value - 1, 0));
  }

  async function createFamily() {
    setBusy(true);
    setMsg(null);
    let snapshot: unknown = undefined;
    if (importing) {
      try {
        const raw = localStorage.getItem("myday.v1");
        if (raw) snapshot = JSON.parse(raw);
      } catch (err) {
        setBusy(false);
        setMsg(`Import error: ${(err as Error).message}`);
        return;
      }
    }

    let response: Response;
    try {
      response = await fetch("/api/onboarding/create-family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyName,
          importSnapshot: snapshot,
          children: namedChildren.map((child) => ({
            name: child.name.trim(),
            av: child.av,
            color: child.color,
            colorLite: child.colorLite,
          })),
          pin: pin || undefined,
        }),
      });
    } catch {
      setBusy(false);
      setMsg("We could not reach the server. Check your connection and try again.");
      return;
    }

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

    if (payload.warning) setMsg(payload.warning);
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="auth-shell">
      <div className="auth-card wizard-card">
        <div className="wizard-steps">
          {STEPS.map((label, index) => (
            <span key={label} className={`wizard-step ${index === step ? "is-active" : ""} ${index < step ? "is-done" : ""}`}>
              {index + 1}. {label}
            </span>
          ))}
        </div>

        {step === 0 && (
          <>
            <h1>Welcome! Let&apos;s set up your family</h1>
            <p>Choose a family name so we can open your private home area.</p>
            <label>
              Family name
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="The Smith family"
                autoFocus
              />
            </label>
            {hasLocalData ? (
              <label style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={importOnCreate} onChange={(e) => setImportOnCreate(e.target.checked)} />
                Bring my saved children, tasks, and rewards over from this device
              </label>
            ) : null}
            <button type="button" onClick={next} disabled={!familyName.trim()}>
              Next: {importing ? "Parent PIN" : "Children"}
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h1>Who are the kids?</h1>
            <p>Add each child with a fun avatar and colour. You can always add more later.</p>
            {children.map((child, index) => (
              <div key={index} className="wizard-child">
                <label>
                  Child {index + 1} name
                  <input
                    type="text"
                    value={child.name}
                    onChange={(e) => updateChild(index, { name: e.target.value })}
                    placeholder="e.g. Mia"
                  />
                </label>
                <div className="wizard-picker">
                  {AVATAR_CHOICES.map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      className={`wizard-chip ${child.av === avatar ? "is-active" : ""}`}
                      onClick={() => updateChild(index, { av: avatar })}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
                <div className="wizard-picker">
                  {COLOR_CHOICES.map(([color, soft]) => (
                    <button
                      key={color}
                      type="button"
                      className={`wizard-chip wizard-chip--color ${child.color === color ? "is-active" : ""}`}
                      style={{ background: soft, borderColor: color }}
                      onClick={() => updateChild(index, { color, colorLite: soft })}
                      aria-label={`Colour ${color}`}
                    />
                  ))}
                </div>
                {children.length > 1 && (
                  <button type="button" className="ghost" onClick={() => setChildren((list) => list.filter((_, i) => i !== index))}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {children.length < 8 && (
              <button type="button" className="ghost" onClick={() => setChildren((list) => [...list, blankChild(list.length)])}>
                + Add another child
              </button>
            )}
            <div className="row">
              <button type="button" className="ghost" onClick={back}>
                Back
              </button>
              <button type="button" onClick={next}>
                Next: Parent PIN
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Protect the parent area</h1>
            <p>
              Set a 4-digit PIN so the kids can use the board without reaching the parent settings. You can skip this
              and set it later.
            </p>
            <label>
              Parent PIN (4 digits)
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
              />
            </label>
            <label>
              Confirm PIN
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
              />
            </label>
            {pin && !pinOk ? <div className="msg error">PINs must match and be exactly 4 digits.</div> : null}
            {msg ? <div className="msg error">{msg}</div> : null}
            <div className="row">
              <button type="button" className="ghost" onClick={back} disabled={busy}>
                Back
              </button>
              <button type="button" onClick={() => void createFamily()} disabled={busy || !familyName.trim() || !pinOk}>
                {busy ? "Setting up…" : pin ? "Create family" : "Skip PIN & create family"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
