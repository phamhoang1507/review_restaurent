export interface ReturnLocation {
  pathname: string;
  search: string;
  hash: string;
}

const DEFAULT_RETURN_TO = "/account";
const MAX_NOTICE_LENGTH = 300;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function routePath(value: string): string {
  const [path = ""] = value.split(/[?#]/u, 1);
  const withoutTrailingSlash = path.replace(/\/+$/u, "");

  return withoutTrailingSlash || "/";
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || codePoint === 0x7f)
    ) {
      return true;
    }
  }

  return false;
}

function isSafeInternalPath(value: string): boolean {
  if (
    value.length === 0 ||
    value.trim() !== value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return false;
  }

  const normalizedRoute = routePath(value).toLowerCase();

  return (
    normalizedRoute !== "/login" &&
    normalizedRoute !== "/register"
  );
}

export function locationToReturnTo(
  location: ReturnLocation,
): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function safeReturnTo(
  value: unknown,
  fallback = DEFAULT_RETURN_TO,
): string {
  const safeFallback = isSafeInternalPath(fallback)
    ? fallback
    : DEFAULT_RETURN_TO;

  return typeof value === "string" &&
    isSafeInternalPath(value)
    ? value
    : safeFallback;
}

export function returnToFromState(
  state: unknown,
  fallback = DEFAULT_RETURN_TO,
): string {
  if (!isRecord(state)) {
    return safeReturnTo(null, fallback);
  }

  return safeReturnTo(state.returnTo, fallback);
}

export function noticeFromState(
  state: unknown,
): string | null {
  if (
    !isRecord(state) ||
    typeof state.notice !== "string"
  ) {
    return null;
  }

  const notice = state.notice
    .replace(/\s+/gu, " ")
    .trim();

  if (notice.length === 0) {
    return null;
  }

  return notice.slice(0, MAX_NOTICE_LENGTH);
}
