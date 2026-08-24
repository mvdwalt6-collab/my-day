"use client";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
      <section style={{ textAlign: "center", display: "grid", gap: 12, maxWidth: 420 }}>
        <h1 style={{ margin: 0 }}>Something went wrong</h1>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>
          We hit a snag loading this page. Your family data is safe.
        </p>
        {error.digest && (
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13 }}>Reference: {error.digest}</p>
        )}
        <div>
          <button type="button" onClick={() => reset()}>Try again</button>
        </div>
      </section>
    </main>
  );
}
