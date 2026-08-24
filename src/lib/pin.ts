// Client-side PIN hashing. SHA-256 with a per-tenant salt.
// NOT a security control against server access — just against a curious kid.

export async function hashPin(pin: string, tenantId: string): Promise<string> {
  const digits = String(pin).replace(/\D/g, "").slice(0, 4);
  if (digits.length !== 4) throw new Error("need-4-digits");
  const enc = new TextEncoder().encode(`${tenantId}:${digits}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPin(pin: string, tenantId: string, hash: string | null): Promise<boolean> {
  if (!hash) return true;
  try {
    const h = await hashPin(pin, tenantId);
    return h === hash;
  } catch {
    return false;
  }
}
