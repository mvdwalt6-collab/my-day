// LocalStorage read-cache — instant boot before the network hydrate lands.

import type { State } from "./types";

const KEY_PREFIX = "myday.v2:";

export function cacheKey(tenantId: string): string {
  return KEY_PREFIX + tenantId;
}

export function loadCached(tenantId: string): State | null {
  try {
    const raw = localStorage.getItem(cacheKey(tenantId));
    if (!raw) return null;
    return JSON.parse(raw) as State;
  } catch {
    return null;
  }
}

export function saveCached(state: State): void {
  try {
    localStorage.setItem(cacheKey(state.tenantId), JSON.stringify(state));
  } catch {
    /* quota exhausted or storage disabled */
  }
}

export function clearCached(tenantId: string): void {
  try {
    localStorage.removeItem(cacheKey(tenantId));
  } catch {
    /* ignore */
  }
}
