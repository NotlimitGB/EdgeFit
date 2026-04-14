const DEFAULT_SITE_URL = "https://edge-fit.vercel.app";

function normalizeSiteUrl(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return DEFAULT_SITE_URL;
  }

  const withProtocol = /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  return withProtocol.replace(/\/+$/, "");
}

export function getSiteUrl() {
  return normalizeSiteUrl(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_URL ||
      DEFAULT_SITE_URL,
  );
}

export function getSiteMetadataBase() {
  return new URL(getSiteUrl());
}

export function getAbsoluteSiteUrl(path = "/") {
  return new URL(path, getSiteUrl()).toString();
}
