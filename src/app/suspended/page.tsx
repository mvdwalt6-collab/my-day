export default function SuspendedPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Family paused</h1>
        <p>
          Your family account is currently paused. Please contact support if you think this is a
          mistake.
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </div>
  );
}
