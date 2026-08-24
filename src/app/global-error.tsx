"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
        <section style={{ textAlign: "center", display: "grid", gap: 12, maxWidth: 420, padding: 24 }}>
          <h1 style={{ margin: 0 }}>Something went wrong</h1>
          <p style={{ margin: 0 }}>Please try again in a moment.</p>
          {error.digest && <p style={{ margin: 0, fontSize: 13 }}>Reference: {error.digest}</p>}
          <div>
            <button type="button" onClick={() => reset()}>Try again</button>
          </div>
        </section>
      </body>
    </html>
  );
}
