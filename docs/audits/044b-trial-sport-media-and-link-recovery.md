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

## Public Rome BONELESS observation

- A read-only browser inspection on 2026-10-27 of `https://snowdex.ru/boards/rome-boneless` rendered the `Rome BONELESS 2025/2026` page. Its gallery showed `Фото пока не подготовлены`, not a broken-image error. The visible merchant CTA pointed to `/go/rome-boneless?from=board-page&placement=board-page`; size actions also use `/go/rome-boneless-wide` for wide variants. HTTP status, cache headers, and browser network records were not captured. The page uses a one-hour public-board cache, so the served observation does not establish the underlying DB row values at capture time.
- In this UI, `Фото пока не подготовлены` is rendered when the canonical board has no non-empty `media` candidate. The canonical SQL selects `products.image_url` and, when supported, `products.gallery_images`; the canonical builder aggregates non-empty media strings from active offers, falling back to inactive offers only when active offers have none. It does not probe URLs or discard a normally populated URL. This confirms the page-level failure boundary is an empty media projection. It does not establish whether the underlying offer fields are blank or whether their values were lost before the canonical query.
- The fallback branch renders no gallery image element when the canonical media list is empty. Therefore this observation does not support hotlink protection, an expired image URL, or an HTTP image error as the cause of the served page state. Reaching the exact row-level cause requires the product offer records.
- The checked-in family audit identifies local canonical slugs `rome-boneless` and `rome-boneless-wide` for season `2025/2026`. This is repository evidence, not an independently verified snapshot of current production rows.
- The public page labels the price as saved and describes four sizes as previously marked. Those are historical records and are not evidence of live stock.
- The merchant CTA was inspected but not followed. The `/go` route performs product lookup and may persist click analytics when a session cookie is present; following it in the production browser would exceed this read-only page inspection. The saved merchant URL, its current validity, and the failure cause remain unknown.

## Local correction

- BoardGallery now detects already-completed failed images during ref attachment, removes failed URLs from the gallery, and uses an honest failed-image message when all configured images fail. If the opened viewer loses its last image, it closes, restores page scrolling, and moves focus to the fallback message because the original trigger no longer exists.
- Direct merchant URLs now require HTTPS, an exact allowlisted hostname, no URL credentials, and no nonstandard port. Unsupported destinations continue to use the existing HTTPS Trial Sport search fallback. Existing supported HTTPS paths remain unchanged.
- An unresolved /go/[slug] now returns a small 404, no-store, noindex recovery page with a catalog link. It does not record an outbound-click event or invent a merchant destination.
- Focused validation: board gallery, store redirect, and outbound route suites — 43 tests passed; targeted ESLint passed. No production or external merchant requests were made.

## Not verified

- Exact production image and merchant URL values, row-level origin of the empty canonical media list, the complete affected product/merchant scope, URL reachability, merchant redirect expiry, current merchant page behavior, and image reuse rights remain UNKNOWN.
- A previously valid HTTPS URL on an allowlisted merchant host may still have expired remotely; no local parser can establish merchant-side availability without a permitted request or authoritative refreshed record.
- The historical user report of a broken image and the merchant failure have not been correlated with exact source records or request-linked diagnostics. The current public render confirms an empty gallery projection, but not why its source fields were empty or whether cached data is involved. No complete production root cause or merchant recovery is claimed.

## Minimum read-only source record for the remaining diagnosis

The following read-only query returns only the Rome BONELESS 2025/2026 offer rows and their canonical identity, media, and source fields. It can be run by the owner in Supabase without sharing credentials or connecting this task to production DB. Do not return session or user data.

```sql
select
  mf.slug as canonical_slug,
  p.slug as offer_slug,
  p.brand,
  p.model_name,
  coalesce(nullif(btrim(p.season_label), ''), mf.season_label) as season_label,
  p.is_active,
  p.family_member_role,
  nullif(btrim(p.image_url), '') as image_url,
  p.gallery_images,
  p.affiliate_url,
  p.source_name,
  p.source_url,
  p.source_checked_at
from products p
left join model_families mf on mf.id = p.family_id
where coalesce(nullif(btrim(p.season_label), ''), mf.season_label) = '2025/2026'
  and (
    mf.slug in ('rome-boneless', 'rome-boneless-wide')
    or p.slug in ('rome-boneless', 'rome-boneless-wide')
    or (lower(btrim(p.brand)) = 'rome' and lower(btrim(p.model_name)) = 'boneless')
  )
order by mf.slug nulls last, p.family_member_role nulls last, p.slug;
```

Before selecting a replacement image, confirm its source context and permission to use it. If remote destination availability must be tested, obtain separate authorization for one bounded merchant request. Until then, do not replace model imagery, alter merchant destinations, or report current availability.
