"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ComponentProps } from "react";

// Shared across entry points for one document, not across users or requests.
let requested = false;

export function CatalogEntryLink(props: Omit<ComponentProps<typeof Link>, "href" | "prefetch">) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancel() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  function prefetch() {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (requested || pathname === "/catalog" || connection?.saveData ||
      ["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "")) return;
    requested = true;
    try { Promise.resolve(router.prefetch("/catalog")).catch(() => {}); } catch { /* Navigation remains normal. */ }
  }
  return <Link {...props} href="/catalog" prefetch={false}
    onPointerEnter={(event) => {
      props.onPointerEnter?.(event);
      if (event.pointerType !== "mouse") return;
      cancel(); timer.current = setTimeout(prefetch, 150);
    }}
    onPointerLeave={(event) => { cancel(); props.onPointerLeave?.(event); }}
    onFocus={(event) => {
      props.onFocus?.(event);
      if (event.currentTarget.matches(":focus-visible")) { cancel(); prefetch(); }
    }}
    onBlur={(event) => { cancel(); props.onBlur?.(event); }} />;
}
