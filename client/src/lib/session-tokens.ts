const ACCESS = "easyfuel_access_token";
const REFRESH = "easyfuel_refresh_token";

function readAccess(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(ACCESS);
}

function readRefresh(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(REFRESH);
}

export function getStoredAccessToken(): string | null {
  return readAccess();
}

export function getStoredRefreshToken(): string | null {
  return readRefresh();
}

export function setStoredTokens(accessToken: string, refreshToken: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(ACCESS, accessToken);
  sessionStorage.setItem(REFRESH, refreshToken);
}

export function clearStoredTokens() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(ACCESS);
  sessionStorage.removeItem(REFRESH);
}

/** Base64url JWT payload decode (exp only; not verified — server validates). */
export function getJwtExpSeconds(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export async function refreshSessionTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const refreshToken = readRefresh();
  if (!refreshToken) return null;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearStoredTokens();
    return null;
  }
  const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken || !data.refreshToken) {
    clearStoredTokens();
    return null;
  }
  setStoredTokens(data.accessToken, data.refreshToken);
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}
