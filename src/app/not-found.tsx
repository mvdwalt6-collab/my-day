import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
      <section style={{ textAlign: "center", display: "grid", gap: 12, maxWidth: 420 }}>
        <h1 style={{ margin: 0 }}>Page not found</h1>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>
          That page does not exist or has moved.
        </p>
        <div>
          <Link href="/">Back to the family board</Link>
        </div>
      </section>
    </main>
  );
}
