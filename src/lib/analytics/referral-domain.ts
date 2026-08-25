export function normalizeReferralDomain(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const candidate = value.trim();

  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//iu.test(candidate)
        ? candidate
        : `https://${candidate}`,
    );

    if (url.username || url.password) {
      return null;
    }

    const hostname = url.hostname
      .toLowerCase()
      .replace(/^www\./u, "")
      .replace(/\.$/u, "");

    return hostname && !hostname.includes(" ") ? hostname : null;
  } catch {
    return null;
  }
}
