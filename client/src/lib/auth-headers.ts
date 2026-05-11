import { getJwtExpSeconds, getStoredAccessToken, refreshSessionTokens } from "./session-tokens";

export async function getAuthHeaders(): Promise<HeadersInit> {
  const base: HeadersInit = { "Content-Type": "application/json" };

  let access = getStoredAccessToken();
  if (!access) {
    return base;
  }

  const exp = getJwtExpSeconds(access);
  if (exp && exp * 1000 < Date.now() + 45_000) {
    const refreshed = await refreshSessionTokens();
    access = refreshed?.accessToken ?? access;
  }

  if (!access) {
    return base;
  }

  return {
    ...base,
    Authorization: `Bearer ${access}`,
  };
}
