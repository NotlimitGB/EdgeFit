"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Only this invisible child suspends; filters and the first grid remain SSR. */
export function CatalogUrlSync({ onChange }: { onChange: (search: string) => void }) {
  const search = useSearchParams().toString();
  useEffect(() => {
    onChange(search);
  }, [search, onChange]);
  return null;
}
