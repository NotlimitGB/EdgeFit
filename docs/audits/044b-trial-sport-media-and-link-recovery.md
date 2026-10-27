# 044B — Trial Sport media and redirect recovery

## Scope and basis

- Source baseline: released candidate ecac63305e4793c2cb3274a87be724e618b9e792.
- All investigation and validation were local. No production HTTP, database, merchant-site request, deployment, or infrastructure operation was performed.
- The observed Rome BONELESS 2025/2026 image failure is not linked to a verified production image URL or an owner-provided source response in the available local evidence.

## Confirmed source findings

1. BoardGallery already handled image onError after React hydration, but did not inspect complete/naturalWidth when its refs attached. A primary image that had failed before hydration could therefore remain selected and broken. The catalog card already had a corresponding ref-time check.
2. Store destination recognition checked only the parsed hostname. A URL on an allowlisted host could still be HTTP, include URL credentials, or specify a nonstandard port and be treated as a direct destination.
3. /go/[slug] redirected an unresolved product slug to /catalog, hiding that the destination record no longer existed. Database lookup failure remains a separate bounded 503 path.
4. The Trial Sport importer extracts values from "big" properties in fetched page HTML and stores the first as the primary image. The current source alone does not prove that this extraction produced the reported Rome image, that a URL is currently reachable, or that an image is licensed for reuse.

## Local correction

- BoardGallery now detects already-completed failed images during ref attachment, removes failed URLs from the gallery, and uses an honest failed-image message when all configured images fail. If the opened viewer loses its last image, it closes, restores page scrolling, and moves focus to the fallback message because the original trigger no longer exists.
- Direct merchant URLs now require HTTPS, an exact allowlisted hostname, no URL credentials, and no nonstandard port. Unsupported destinations continue to use the existing HTTPS Trial Sport search fallback. Existing supported HTTPS paths remain unchanged.
- An unresolved /go/[slug] now returns a small 404, no-store, noindex recovery page with a catalog link. It does not record an outbound-click event or invent a merchant destination.
- Focused validation: board gallery, store redirect, and outbound route suites — 43 tests passed; targeted ESLint passed. No production or external merchant requests were made.

## Not verified

- Exact affected production product/offer identities, current image URLs, URL reachability, merchant redirect expiry, current merchant page behavior, and image reuse rights remain UNKNOWN.
- A previously valid HTTPS URL on an allowlisted merchant host may still have expired remotely; no local parser can establish merchant-side availability without a permitted request or authoritative refreshed record.
- The reported production image fallback and merchant failure have not been correlated with these source paths. No production root cause or recovery is claimed.

## Minimum evidence for the remaining merchant-specific diagnosis

Provide an owner-approved, sanitized source record for the exact product/season containing its saved media URL and merchant URL, the capture time and source context, and confirmation of permitted image use. If live availability must be tested, obtain separate authorization for one bounded merchant request. Until then, do not replace model imagery, alter merchant destinations, or report current availability.
