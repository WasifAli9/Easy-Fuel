/**
 * Legacy JWT session storage — removed in favor of Passport cookie sessions.
 * Kept as no-ops so older imports do not break; prefer `useAuth().session` for gating.
 */
export function getStoredAccessToken(): string | null {
  return null;
}

export function getStoredRefreshToken(): string | null {
  return null;
}

export function setStoredTokens(_accessToken: string, _refreshToken: string) {
  /* cookie session */
}

export function clearStoredTokens() {
  /* cookie session cleared via POST /api/logout */
}

export function getJwtExpSeconds(_token: string): number | null {
  return null;
}

export async function refreshSessionTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  return null;
}
