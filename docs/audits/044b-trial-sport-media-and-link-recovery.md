# 044B — Trial Sport media and redirect recovery

## Scope and basis

- Source baseline: released candidate ecac63305e4793c2cb3274a87be724e618b9e792.
- Code investigation and tests were local. One read-only browser navigation inspected the public Rome BONELESS page; no direct production database access, merchant-site request, deployment, or infrastructure operation was performed.
- The public page currently serves an empty gallery projection, but no underlying offer URL or owner-provided source response is available to identify why.

## Confirmed source findings

1. BoardGallery already handled image onError after React hydration, but did not inspect complete/naturalWidth when its refs attached. A primary image that had failed before hydration could therefore remain selected and broken. The catalog card already had a corresponding ref-time check.
2. Store destination recognition checked only the parsed hostname. A URL on an allowlisted host could still be HTTP, include URL credentials, or specify a nonstandard port and be treated as a direct destination.
3. /go/[slug] redirected an unresolved product slug to /catalog, hiding that the destination record no longer existed. Database lookup failure remains a separate bounded 503 path.
4. The Trial Sport importer extracts values from "big" properties in fetched page HTML and stores the first as the primary image. The current source alone does not prove that this extraction produced the reported Rome image, that a URL is currently reachable, or that an image is licensed for reuse.
5. A source-level data-loss path is possible: if fetched Trial Sport HTML has no `"big"` properties, the importer produces `imageUrl: ""` and an empty gallery. The catalog upsert replaces `image_url` with that empty value on slug conflict and synchronizes `gallery_images` to the incoming array. This can remove previously stored media during an import. It is not linked to the Rome BONELESS record.

## Public Rome BONELESS observation

- A read-only browser inspection on 2026-10-27 of `https://snowdex.ru/boards/rome-boneless` rendered the `Rome BONELESS 2025/2026` page. Its gallery showed `Фото пока не подготовлены`, not a broken-image error. The visible merchant CTA pointed to `/go/rome-boneless?from=board-page&placement=board-page`; size actions also use `/go/rome-boneless-wide` for wide variants. HTTP status, cache headers, and browser network records were not captured. The page uses a one-hour public-board cache, so the served observation does not establish the underlying DB row values at capture time.
- In this UI, `Фото пока не подготовлены` is rendered when the canonical board has no non-empty `media` candidate. The canonical SQL selects `products.image_url` and, when supported, `products.gallery_images`; the canonical builder aggregates non-empty media strings from active offers, falling back to inactive offers only when active offers have none. It does not probe URLs or discard a normally populated URL. This confirms the page-level failure boundary is an empty media projection. It does not establish whether the underlying offer fields are blank or whether their values were lost before the canonical query.
- The fallback branch renders no gallery image element when the canonical media list is empty. Therefore this observation does not support hotlink protection, an expired image URL, or an HTTP image error as the cause of the served page state. Reaching the exact row-level cause requires the product offer records.
- The checked-in family audit identifies local canonical slugs `rome-boneless` and `rome-boneless-wide` for season `2025/2026`. This is repository evidence, not an independently verified snapshot of current production rows.
- The public page labels the price as saved and describes four sizes as previously marked. Those are historical records and are not evidence of live stock.
- The merchant CTA was inspected but not followed. The `/go` route performs product lookup and may persist click analytics when a session cookie is present; following it in the production browser would exceed this read-only page inspection. The saved merchant URL, its current validity, and the failure cause remain unknown.

## Official Rome source and image-rights check

- On 2026-10-27, the official Rome Snowboards product page identified the Boneless as a 2025/2026 product and exposed a seven-image product gallery: [Rome Boneless 2025/2026](https://romesnowboards.com/products/rome-boneless-2526-unisex-snowboard). This proves that Rome's public product page currently presents product imagery; it does not identify the image URL previously stored in SnowDex, establish that Trial-Sport used the same asset, or grant SnowDex a right to reuse it.
- I checked the official [Rome Snowboards Terms & Conditions](https://romesnowboards.com/pages/terms-conditions) for image reuse, copyright, and intellectual-property permission. The inspected page did not contain an explicit image-use grant. This is not evidence that permission is impossible or denied; image rights remain **UNKNOWN** until Rome or the relevant rights holder confirms them.
- No image was downloaded, copied, rehosted, or added. No request was made to Trial-Sport, and no merchant CTA was followed.

## Local correction

- BoardGallery now detects already-completed failed images during ref attachment, removes failed URLs from the gallery, and uses an honest failed-image message when all configured images fail. If the opened viewer loses its last image, it closes, restores page scrolling, and moves focus to the fallback message because the original trigger no longer exists.
- Direct merchant URLs now require HTTPS, an exact allowlisted hostname, no URL credentials, and no nonstandard port. Unsupported destinations continue to use the existing HTTPS Trial Sport search fallback. Existing supported HTTPS paths remain unchanged.
- An unresolved /go/[slug] now returns a small 404, no-store, noindex recovery page with a catalog link. It does not record an outbound-click event or invent a merchant destination.
- Focused validation: board gallery, store redirect, and outbound route suites — 43 tests passed; targeted ESLint passed. No production or external merchant requests were made.

## Not verified

- Exact production image and merchant URL values, row-level origin of the empty canonical media list, the complete affected product/merchant scope, URL reachability, merchant redirect expiry, current merchant page behavior, and image reuse rights remain UNKNOWN.
- A previously valid HTTPS URL on an allowlisted merchant host may still have expired remotely; no local parser can establish merchant-side availability without a permitted request or authoritative refreshed record.
- The historical user report of a broken image and the merchant failure have not been correlated with exact source records or request-linked diagnostics. The current public render confirms an empty gallery projection, but not why its source fields were empty or whether cached data is involved. No complete production root cause or merchant recovery is claimed.
- The importer/upsert overwrite path is a confirmed mechanism, not a confirmed explanation for the served BONELESS page. The owner-run query below can show current source fields and timestamps, but cannot prove the prior value or when it was cleared; import history or an authoritative source capture would be needed for that link.

## Follow-up importer media-preservation correction

The Trial Sport parser has no source signal that distinguishes an intentional media removal from a page on which the extractor found no `"big"` image fields. The Traektoria parser likewise maps a missing or empty `photo_list` to an empty image set. Therefore an empty extracted list is treated as **not observed**, not as an explicit delete. The shared managed-store merge now preserves existing media for the same known product and source context when extraction is empty; newly extracted candidates still replace draft media, and known identity/source conflicts do not carry old media to the incoming product. A new product with no extracted media still starts with an empty gallery. The generic upsert behavior is unchanged for direct/admin import paths such as CSV upload and `/api/catalog-import`.

This is a data-preservation rule based on confirmed parser/upsert behavior; it does not prove that the Rome BONELESS media was previously present or that it was cleared by an import. Preserved URLs may be stale or subject to rights restrictions. This correction establishes neither image reachability nor permission to use the media.

## `/go` failure classification

The outbound route wraps product lookup in public DB work. A missing product now returns an explicit noindex 404. A rejected/unavailable lookup or another propagated handler failure is caught by the route and returns a no-store 503 with **«Не удалось открыть магазин»**; safe logs use category `lookup_unavailable`. This is the failure path matching that presentation, but no request-linked production evidence establishes that it was the cause of the reported Rome click.

For a product that was loaded, only HTTPS URLs on the exact supported merchant hosts are used as direct destinations. Unsupported or malformed stored destinations resolve to the general Trial Sport search URL, and the UI labels that action **«Искать в Trial Sport»** rather than claiming an exact product link. The generated search redirect does not establish that the model is present. A syntactically acceptable but expired merchant product URL is not checked remotely. The candidate's missing-product 404 and URL-scheme/host checks improve separate edge cases; they do not resolve lookup-unavailable 503s or prove the reported merchant destination works. No merchant URL was followed during this review.

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
