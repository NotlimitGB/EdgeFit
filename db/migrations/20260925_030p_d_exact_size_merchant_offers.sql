-- Additive EdgeFit v2 commerce contract. This migration intentionally contains
-- structure only: no legacy rows are promoted and no production data is changed.
create table if not exists merchants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  domain text not null,
  status text not null default 'UNKNOWN',
  partner_status text not null default 'NONE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_merchants_slug_not_blank check (length(trim(slug)) > 0),
  constraint chk_merchants_name_not_blank check (length(trim(name)) > 0),
  constraint chk_merchants_domain_not_blank check (length(trim(domain)) > 0),
  constraint chk_merchants_status
    check (status in ('ACTIVE', 'INACTIVE', 'UNKNOWN')),
  constraint chk_merchants_partner_status
    check (partner_status in ('NONE', 'NEGOTIATING', 'ACTIVE', 'PAUSED'))
);

create table if not exists merchant_products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete restrict,
  source_product_key text not null,
  merchant_product_sku text,
  source_url text not null,
  brand_raw text,
  model_raw text,
  season_raw text,
  variant_raw text,
  manufacturer_sku text,
  gtin text,
  source_kind text not null,
  source_status text not null default 'UNKNOWN',
  commercial_rights_status text not null default 'UNKNOWN',
  rights_evidence_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_merchant_products_source_key_not_blank
    check (length(trim(source_product_key)) > 0),
  constraint chk_merchant_products_source_url_not_blank
    check (length(trim(source_url)) > 0),
  constraint chk_merchant_products_source_kind
    check (source_kind in (
      'PARTNER_API', 'PARTNER_FEED', 'AFFILIATE_FEED', 'MANUAL_VERIFIED',
      'LEGACY_IMPORT', 'PUBLIC_REFERENCE'
    )),
  constraint chk_merchant_products_source_status
    check (source_status in ('ACTIVE', 'INACTIVE', 'UNKNOWN')),
  constraint chk_merchant_products_rights_status
    check (commercial_rights_status in ('AUTHORIZED', 'UNKNOWN', 'RESTRICTED')),
  constraint chk_merchant_products_authorization_evidence
    check (
      commercial_rights_status <> 'AUTHORIZED'
      or (rights_evidence_ref is not null and length(trim(rights_evidence_ref)) > 0)
    ),
  constraint uq_merchant_products_source_key unique (merchant_id, source_product_key),
  constraint uq_merchant_products_id_merchant unique (id, merchant_id)
);

create table if not exists merchant_offers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  merchant_product_id uuid not null,
  offer_scope text not null,
  source_identity_key text not null,
  merchant_size_sku text,
  source_size_cm numeric(5, 1),
  raw_size_label text,
  canonical_board_kind text,
  canonical_board_id uuid,
  canonical_board_slug text,
  canonical_size_identity_key text,
  canonical_size_cm numeric(5, 1),
  display_size_label text,
  price_amount numeric(12, 2),
  currency char(3),
  price_scope text,
  availability_status text not null default 'UNKNOWN',
  reconciliation_status text,
  reconciliation_codes text[] not null default '{}',
  merchant_product_url text not null,
  merchant_size_url text,
  source_url text not null,
  feed_version text,
  checksum text,
  feed_generated_at timestamptz,
  merchant_updated_at timestamptz,
  source_received_at timestamptz,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_merchant_offers_product
    foreign key (merchant_product_id, merchant_id)
    references merchant_products(id, merchant_id) on delete restrict,
  constraint chk_merchant_offers_scope
    check (offer_scope in ('PRODUCT', 'EXACT_SIZE')),
  constraint chk_merchant_offers_source_identity_not_blank
    check (length(trim(source_identity_key)) > 0),
  constraint chk_merchant_offers_source_size_cm
    check (source_size_cm is null or source_size_cm > 0),
  constraint chk_merchant_offers_exact_size_source_evidence
    check (
      offer_scope <> 'EXACT_SIZE'
      or (merchant_size_sku is not null and length(trim(merchant_size_sku)) > 0)
      or (raw_size_label is not null and length(trim(raw_size_label)) > 0)
      or source_size_cm is not null
      or (merchant_size_url is not null and length(trim(merchant_size_url)) > 0)
    ),
  constraint chk_merchant_offers_source_identity_namespace
    check (
      offer_scope <> 'EXACT_SIZE'
      or (
        lower(trim(source_identity_key)) not like 'canonical-size:%'
        and (
          (
            source_identity_key ~* '^sku:[^[:space:]].*'
            and merchant_size_sku is not null
            and length(trim(merchant_size_sku)) > 0
          )
          or source_identity_key ~* '^variant:[^[:space:]].*'
          or (
            source_identity_key ~* '^url:https?://[^[:space:]].*'
            and merchant_size_url is not null
            and length(trim(merchant_size_url)) > 0
          )
        )
      )
    ),
  constraint chk_merchant_offers_availability
    check (availability_status in ('IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'UNKNOWN')),
  constraint chk_merchant_offers_reconciliation
    check (
      (offer_scope = 'PRODUCT' and reconciliation_status is null and cardinality(reconciliation_codes) = 0)
      or (
        offer_scope = 'EXACT_SIZE'
        and reconciliation_status is not null
        and reconciliation_status in ('MATCHED', 'UNMATCHED', 'CONFLICT')
        and (
          (reconciliation_status = 'MATCHED'
            and canonical_board_kind is not null
            and canonical_board_kind in ('FAMILY', 'PRODUCT')
            and canonical_board_id is not null
            and canonical_board_slug is not null
            and length(trim(canonical_board_slug)) > 0
            and canonical_size_identity_key is not null
            and length(trim(canonical_size_identity_key)) > 0
            and canonical_size_cm is not null
            and canonical_size_cm > 0
            and display_size_label is not null
            and length(trim(display_size_label)) > 0
            and cardinality(reconciliation_codes) = 0)
          or (reconciliation_status = 'UNMATCHED'
            and canonical_board_kind is null
            and canonical_board_id is null
            and canonical_board_slug is null
            and canonical_size_identity_key is null
            and canonical_size_cm is null
            and display_size_label is null
            and cardinality(reconciliation_codes) = 0)
          or (reconciliation_status = 'CONFLICT'
            and canonical_board_kind is null
            and canonical_board_id is null
            and canonical_board_slug is null
            and canonical_size_identity_key is null
            and canonical_size_cm is null
            and display_size_label is null
            and cardinality(reconciliation_codes) > 0)
        )
      )
    ),
  constraint chk_merchant_offers_scope_size_fields
    check (
      offer_scope = 'EXACT_SIZE'
      or (merchant_size_sku is null and source_size_cm is null and raw_size_label is null
        and canonical_board_kind is null and canonical_board_id is null
        and canonical_board_slug is null and canonical_size_identity_key is null
        and canonical_size_cm is null and display_size_label is null)
    ),
  constraint chk_merchant_offers_price
    check (
      (price_amount is null and currency is null and price_scope is null)
      or (
        price_amount is not null
        and price_amount > 0
        and currency is not null
        and currency ~ '^[A-Z]{3}$'
        and price_scope is not null
        and price_scope = offer_scope
      )
    ),
  constraint chk_merchant_offers_product_price_scope
    check (offer_scope <> 'PRODUCT' or price_scope is null or price_scope = 'PRODUCT'),
  constraint chk_merchant_offers_size_price_scope
    check (offer_scope <> 'EXACT_SIZE' or price_scope is null or price_scope = 'EXACT_SIZE'),
  constraint chk_merchant_offers_urls_not_blank
    check (length(trim(merchant_product_url)) > 0 and length(trim(source_url)) > 0),
  constraint uq_merchant_offers_product_source_identity
    unique (merchant_product_id, source_identity_key)
);

create unique index if not exists uq_merchant_offers_product_scope
  on merchant_offers(merchant_product_id)
  where offer_scope = 'PRODUCT';
create unique index if not exists uq_merchant_offers_merchant_size_sku
  on merchant_offers(merchant_id, merchant_size_sku)
  where offer_scope = 'EXACT_SIZE' and merchant_size_sku is not null;
create index if not exists idx_merchant_offers_canonical_size
  on merchant_offers(canonical_size_identity_key, observed_at desc)
  where offer_scope = 'EXACT_SIZE' and reconciliation_status = 'MATCHED';
create index if not exists idx_merchant_offers_merchant_product
  on merchant_offers(merchant_id, merchant_product_id);
create index if not exists idx_merchant_offers_observed_at
  on merchant_offers(observed_at desc);

comment on column merchant_offers.feed_generated_at is
  'Timestamp claimed by the merchant feed; null means the source did not provide it.';
comment on column merchant_offers.merchant_updated_at is
  'Merchant-reported update time for this offer state; never inferred from EdgeFit row updates.';
comment on column merchant_offers.source_received_at is
  'Time EdgeFit received the source payload containing this offer state.';
comment on column merchant_offers.observed_at is
  'Time EdgeFit successfully observed this exact offer state; unrelated row edits must not change it.';
