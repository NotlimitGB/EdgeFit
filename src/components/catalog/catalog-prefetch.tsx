"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const PrefetchBudget = createContext<Set<string> | null>(null);

export function CatalogPrefetchProvider({ children }: { children: ReactNode }) {
  const [requested] = useState(() => new Set<string>());
  return <PrefetchBudget.Provider value={requested}>{children}</PrefetchBudget.Provider>;
}

function connectionAllowsPrefetch() {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return !connection?.saveData && !["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "");
}

export function useCatalogIntentPrefetch(href: string) {
  const router = useRouter();
  const requested = useContext(PrefetchBudget);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancel() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, [href]);
  function prefetch() {
    if (!requested || !connectionAllowsPrefetch() || requested.has(href) || requested.size >= 8) return;
    requested.add(href);
    try {
      // A synchronous or asynchronous failure must never affect normal navigation.
      Promise.resolve(router.prefetch(href)).catch(() => {});
    } catch { /* best-effort speculation only */ }
  }
  return {
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      cancel();
      timer.current = setTimeout(prefetch, 150);
    },
    onPointerLeave: cancel,
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (event.currentTarget.matches(":focus-visible")) { cancel(); prefetch(); }
    },
    onBlur: cancel,
  };
}
