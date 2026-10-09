-- 040F: additive source artifact only. Requires the existing merchant tables.
-- Do not execute automatically; no invented observation timestamps or data updates.
alter table merchant_offers
  add column if not exists price_observed_at timestamptz,
  add column if not exists price_evidence_ref text,
  add column if not exists price_source_url text,
  add column if not exists price_source_updated_at timestamptz,
  add column if not exists price_ingested_at timestamptz,
  add column if not exists availability_observed_at timestamptz,
  add column if not exists availability_evidence_ref text,
  add column if not exists availability_source_url text,
  add column if not exists availability_source_updated_at timestamptz,
  add column if not exists availability_ingested_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
    where conname = 'chk_merchant_price_observation_evidence'
      and conrelid = 'merchant_offers'::regclass) then
    alter table merchant_offers add constraint chk_merchant_price_observation_evidence check (
    price_observed_at is null or (
      price_amount is not null
      and price_evidence_ref is not null and length(trim(price_evidence_ref)) > 0
      and price_source_url is not null and length(trim(price_source_url)) > 0
      and price_ingested_at is not null and price_ingested_at >= price_observed_at
    )
    );
  end if;
  if not exists (select 1 from pg_constraint
    where conname = 'chk_merchant_availability_observation_evidence'
      and conrelid = 'merchant_offers'::regclass) then
    alter table merchant_offers add constraint chk_merchant_availability_observation_evidence check (
    availability_observed_at is null or (
      availability_evidence_ref is not null and length(trim(availability_evidence_ref)) > 0
      and availability_source_url is not null and length(trim(availability_source_url)) > 0
      and availability_ingested_at is not null and availability_ingested_at >= availability_observed_at
    )
    );
  end if;
end $$;

comment on column merchant_offers.price_observed_at is
  'Evidence-backed price observation only. Never inferred from observed_at or row edits.';
comment on column merchant_offers.availability_observed_at is
  'Evidence-backed stock observation at offer_scope. PRODUCT is never exact-size stock.';
comment on column merchant_offers.price_evidence_ref is
  'Stable reference to retained source evidence; ingestion time is not observation time.';
comment on column merchant_offers.availability_evidence_ref is
  'Stable reference to retained source evidence, independent of price evidence.';
