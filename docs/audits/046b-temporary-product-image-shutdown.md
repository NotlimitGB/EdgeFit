# 046B — temporary product-photo shutdown

The default policy in `src/lib/public-product-media.ts` returns no product media.
It is deliberately independent of merchant, host and licensing status, and does
not delete or modify Product records. Remove the temporary policy and its public
projection calls in a reviewed release when photography is authorized again.
Catalog DTO/cache, board gallery props and client gallery/card guards do not emit
product image elements; recommendation API and saved-result client props project
empty image fields after scoring and without modifying the persisted snapshot.
Legacy browser snapshots are protected by the component guards. Historical
source/provenance and merchant URLs remain unchanged; raw URLs may still appear
in non-image text/provenance and stored records. This task disables display and
loading, not recursive URL sanitization. Current result cards do not render photos.

The Next optimizer explicitly permits no remote image hosts. Existing local
non-product assets remain accessible. Source review found no custom public product
image proxy or product-photo OG/Twitter/JSON-LD metadata. This is not a licensing
determination and does not remove already downloaded images from user devices.

## Local evidence

In a disposable production-mode Next 16.2.2 fixture, canonical loader data was
replaced with one synthetic product with `https://photo-witness.invalid/test.jpg`.
The actual candidate catalog and board rendering code was retained. Complete
HTML and RSC/Flight responses for `/catalog` and `/boards/synthetic-board` all
returned 200 without the witness URL. A remote `/_next/image` request returned
400. Loader doubles do not verify production data, a real PostgreSQL connection,
concurrency or production cache behavior. The local browser showed fallback on
catalog and board at mobile/desktop widths, no product image elements and no
horizontal overflow. No third-party images were requested by these fixtures.

Full suite: 1772 passed, one failed. The failure in `exact-size-offer.test.ts`
(`not_confirmed` vs `search_only`) was independently reproduced on baseline
`4efb70b` in 046A_R2. Image-rendering regression tests exercise the prior gallery
logic with the shutdown policy mocked off; separate shutdown tests exercise the
real default-off policy. No production HTTP or database access was used.

## Release cache gate

Catalog Data Cache key is bumped; its TTL remains 300 seconds. Board Data Cache
may retain source media, but new renders filter before client props. Old Next
Full Route/ISR HTML and Flight, CDN/platform caches and browser Router Cache can
still serve pre-shutdown images. Before any authorized deployment, inventory
Timeweb instances, persistent `.next` mounts and CDN settings, then arrange an
owner-approved targeted purge or clean release artifact for affected catalog and
board routes. Confirm the deployed SHA and check representative complete HTML,
Flight and browser requests after the agreed procedure. Runtime cache topology
is not independently confirmed. Previously saved pages, old open tabs and
downloaded images cannot be recalled. No cache invalidation has been executed.
