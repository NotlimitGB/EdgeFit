"use client";
import { useEffect, useEffectEvent } from "react";
import { useSearchParams } from "next/navigation";

/** Only this invisible child suspends; filters and the first grid remain SSR. */
export function CatalogUrlSync({ onChange }: { onChange: (search: string) => void }) {
  const search = useSearchParams().toString();
  const notify = useEffectEvent(onChange);
  useEffect(() => {
    notify(search);
  }, [search]);
  return null;
}
