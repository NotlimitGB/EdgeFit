export type HostingProvider = "timeweb" | "vercel";

// Next config host conditions are anchored by Next; never match suffixes/subdomains.
export const TIMEWEB_INDEXABLE_HOST_PATTERN = "(?:www\\.)?snowdex\\.ru";

export function getHostingProvider(value = process.env.NEXT_PUBLIC_HOSTING_PROVIDER): HostingProvider {
  if (!value) return "vercel";
  if (value === "timeweb" || value === "vercel") return value;
  throw new Error("NEXT_PUBLIC_HOSTING_PROVIDER must be timeweb or vercel.");
}

export function isCanonicalProductionHost(host: string | null | undefined) {
  if (!host || !/^(?:www\.)?snowdex\.ru(?::\d{1,5})?$/iu.test(host)) return false;
  const port = host.split(":")[1];
  return port === undefined || (Number(port) > 0 && Number(port) <= 65535);
}

export function isBrowserAnalyticsAllowed() {
  if (getHostingProvider() !== "timeweb") return true;
  return typeof window !== "undefined" && isCanonicalProductionHost(window.location.hostname);
}
