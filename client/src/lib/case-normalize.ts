function toSnakeCase(key: string) {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function toCamelCase(key: string) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function withCaseAliasesDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => withCaseAliasesDeep(item)) as T;
  }
  if (!isPlainObject(input)) return input;

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedValue = withCaseAliasesDeep(value);
    out[key] = normalizedValue;

    const snake = toSnakeCase(key);
    const camel = toCamelCase(key);
    if (out[snake] === undefined) out[snake] = normalizedValue;
    if (out[camel] === undefined) out[camel] = normalizedValue;
  }
  return out as T;
}

let fetchNormalizationInstalled = false;

export function installGlobalFetchCaseNormalization() {
  if (fetchNormalizationInstalled || typeof window === "undefined" || typeof window.fetch !== "function") {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (async (...args: Parameters<typeof fetch>) => {
    let [input, init] = args;
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : "";
    const isApiCall = url.startsWith("/api") || url.includes("/api/");

    if (isApiCall && init?.body) {
      const headerSource = (init.headers || {}) as Record<string, string>;
      const contentType =
        headerSource["Content-Type"] ||
        headerSource["content-type"] ||
        "";
      const isLikelyJson =
        String(contentType).includes("application/json") ||
        typeof init.body === "string" ||
        isPlainObject(init.body) ||
        Array.isArray(init.body);

      if (isLikelyJson) {
        try {
          if (typeof init.body === "string") {
            const parsed = JSON.parse(init.body);
            init = {
              ...init,
              body: JSON.stringify(withCaseAliasesDeep(parsed)),
            };
          } else if (isPlainObject(init.body) || Array.isArray(init.body)) {
            init = {
              ...init,
              body: JSON.stringify(withCaseAliasesDeep(init.body as any)),
              headers: {
                ...headerSource,
                "Content-Type": contentType || "application/json",
              },
            };
          }
        } catch {
          // If body is not valid JSON, send as-is.
        }
      }
    }

    const response = await originalFetch(input, init);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return response;
    }

    const originalJson = response.json.bind(response);
    (response as any).json = async () => {
      const payload = await originalJson();
      return withCaseAliasesDeep(payload);
    };

    return response;
  }) as typeof window.fetch;

  fetchNormalizationInstalled = true;
}

