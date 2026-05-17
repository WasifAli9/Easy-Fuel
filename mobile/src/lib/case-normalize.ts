function toSnakeCase(key: string) {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function toCamelCase(key: string) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Mirror web portal: API payloads may use camelCase (Drizzle) or snake_case (legacy). */
export function withCaseAliasesDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => withCaseAliasesDeep(item)) as T;
  }
  if (!isPlainObject(input)) return input;

  const out: Record<string, unknown> = {};
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
