"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./site-shell.module.css";

function closeMenu(details: HTMLDetailsElement | null) {
  if (!details?.open) return;
  if (details.querySelector("nav")?.contains(document.activeElement)) {
    details.querySelector("summary")?.focus({ preventScroll: true });
  }
  details.open = false;
}

export function MobileMenu({ children }: { children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) closeMenu(details.current);
    previousPathname.current = pathname;
  }, [pathname]);

  return (
    <details ref={details} className={styles.mobileMenu}>
      <summary aria-label="Открыть навигацию">Меню <span aria-hidden="true">☰</span></summary>
      <nav aria-label="Мобильная навигация" onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
        if (link && event.currentTarget.contains(link)) closeMenu(details.current);
      }}>
        {children}
      </nav>
    </details>
  );
}
