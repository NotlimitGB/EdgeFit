export const INTERNAL_ACCESS_COOKIE = "edgefit-internal-access";
export const INTERNAL_LOGIN_PATH = "/internal/login";
export const DEFAULT_INTERNAL_REDIRECT = "/internal/catalog";

function getPassword() {
  return process.env.INTERNAL_ACCESS_PASSWORD?.trim() ?? "";
}

function getSecret() {
  return process.env.INTERNAL_ACCESS_SECRET?.trim() || getPassword();
}

function getHashSource() {
  const password = getPassword();

  if (!password) {
    throw new Error(
      "Не задана переменная INTERNAL_ACCESS_PASSWORD. Добавьте её в .env.local.",
    );
  }

  return `${password}:${getSecret()}:edgefit-internal`;
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(digest));

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isInternalAccessConfigured() {
  return Boolean(getPassword());
}

export async function createInternalAccessToken() {
  return sha256Hex(getHashSource());
}

export async function isValidInternalAccessToken(token?: string | null) {
  if (!token || !isInternalAccessConfigured()) {
    return false;
  }

  return token === (await createInternalAccessToken());
}

export function normalizeInternalNextPath(path?: string | null) {
  if (!path || !path.startsWith("/internal")) {
    return DEFAULT_INTERNAL_REDIRECT;
  }

  return path;
}

export function getInternalAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}
