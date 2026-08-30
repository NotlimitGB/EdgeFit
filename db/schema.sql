create extension if not exists pgcrypto;

do $$
begin
  create type riding_style_type as enum ('all-mountain', 'park', 'freeride');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type skill_level_type as enum ('beginner', 'intermediate', 'advanced');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type width_type as enum ('regular', 'mid-wide', 'wide');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type boot_drag_risk_type as enum ('low', 'medium', 'high');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type stance_type as enum ('standard', 'duck', 'unknown');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type board_line_type as enum ('men', 'women', 'unisex');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type board_line_preference_type as enum ('men', 'women', 'any');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type board_shape_type as enum ('twin', 'asym-twin', 'directional-twin', 'directional', 'tapered-directional');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type board_shape_type add value if not exists 'asym-twin';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type camber_profile_type as enum ('camber', 'rocker', 'flat', 'hybrid-camber', 'hybrid-rocker');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type aggressiveness_type as enum ('relaxed', 'balanced', 'aggressive');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type terrain_priority_type as enum ('balanced', 'switch-freestyle', 'groomers-carving', 'soft-snow');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type product_data_status_type as enum ('draft', 'verified');
exception
  when duplicate_object then null;
end $$;

create table if not exists model_families (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  identity_key text not null,
  brand text not null,
  model_name text not null,
  season_label text not null,
  description_short text,
  description_full text,
  riding_style riding_style_type,
  skill_level skill_level_type,
  flex smallint,
  board_line board_line_type,
  shape_type board_shape_type,
  camber_profile camber_profile_type,
  canonical_source_kind text,
  canonical_source_name text,
  canonical_source_url text,
  canonical_source_checked_at date,
  canonical_data_status product_data_status_type not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_model_families_slug unique (slug),
  constraint uq_model_families_identity_key unique (identity_key),
  constraint chk_model_families_flex
    check (flex is null or flex between 1 and 10),
  constraint chk_model_families_slug_not_blank
    check (length(trim(slug)) > 0),
  constraint chk_model_families_identity_key_not_blank
    check (length(trim(identity_key)) > 0),
  constraint chk_model_families_brand_not_blank
    check (length(trim(brand)) > 0),
  constraint chk_model_families_model_name_not_blank
    check (length(trim(model_name)) > 0),
  constraint chk_model_families_season_label_not_blank
    check (length(trim(season_label)) > 0),
  constraint chk_model_families_canonical_source_kind
    check (
      canonical_source_kind is null
      or canonical_source_kind in (
        'verified-official',
        'manual',
        'trusted-member',
        'fallback-member'
      )
    )
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  brand text not null,
  model_name text not null,
  season_label text,
  description_short text not null,
  description_full text not null,
  riding_style riding_style_type not null,
  skill_level skill_level_type not null,
  flex smallint not null check (flex between 1 and 10),
  price_from integer not null,
  image_url text not null,
  gallery_images jsonb not null default '[]'::jsonb,
  affiliate_url text not null,
  is_active boolean not null default true,
  board_line board_line_type not null default 'unisex',
  shape_type board_shape_type,
  camber_profile camber_profile_type,
  data_status product_data_status_type not null default 'draft',
  source_name text,
  source_url text,
  source_checked_at date,
  family_id uuid,
  family_member_role text,
  family_match_method text,
  family_match_confidence text,
  family_manual_override boolean not null default false,
  family_match_reason text,
  family_matched_at timestamptz,
  truth_model_version smallint,
  truth_riding_styles riding_style_type[],
  truth_skill_level_min skill_level_type,
  truth_skill_level_max skill_level_type,
  truth_board_line board_line_type,
  truth_flex numeric(3, 1),
  truth_shape_type board_shape_type,
  truth_camber_profile camber_profile_type,
  truth_attribute_evidence jsonb,
  scenarios jsonb not null default '[]'::jsonb,
  not_ideal_for jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table products
  add column if not exists season_label text;

alter table products
  add column if not exists gallery_images jsonb not null default '[]'::jsonb;

alter table products
  add column if not exists shape_type board_shape_type;

alter table products
  add column if not exists camber_profile camber_profile_type;

alter table products
  add column if not exists data_status product_data_status_type not null default 'draft';

alter table products
  add column if not exists source_name text;

alter table products
  add column if not exists source_url text;

alter table products
  add column if not exists source_checked_at date;

alter table products
  add column if not exists family_id uuid;

alter table products
  add column if not exists family_member_role text;

alter table products
  add column if not exists family_match_method text;

alter table products
  add column if not exists family_match_confidence text;

alter table products
  add column if not exists family_manual_override boolean not null default false;

alter table products
  add column if not exists family_match_reason text;

alter table products
  add column if not exists family_matched_at timestamptz;

alter table products
  add column if not exists truth_model_version smallint,
  add column if not exists truth_riding_styles riding_style_type[],
  add column if not exists truth_skill_level_min skill_level_type,
  add column if not exists truth_skill_level_max skill_level_type,
  add column if not exists truth_board_line board_line_type,
  add column if not exists truth_flex numeric(3, 1),
  add column if not exists truth_shape_type board_shape_type,
  add column if not exists truth_camber_profile camber_profile_type,
  add column if not exists truth_attribute_evidence jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'products'::regclass
      and conname = 'chk_products_truth_version'
  ) then
    alter table products add constraint chk_products_truth_version
      check (truth_model_version is null or truth_model_version = 2);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'products'::regclass
      and conname = 'chk_products_truth_evidence_object'
  ) then
    alter table products add constraint chk_products_truth_evidence_object
      check (
        truth_attribute_evidence is null
        or jsonb_typeof(truth_attribute_evidence) = 'object'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'products'::regclass
      and conname = 'chk_products_truth_riding_styles_nonempty'
  ) then
    alter table products add constraint chk_products_truth_riding_styles_nonempty
      check (
        truth_riding_styles is null
        or cardinality(truth_riding_styles) > 0
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'products'::regclass
      and conname = 'chk_products_truth_skill_range'
  ) then
    alter table products add constraint chk_products_truth_skill_range
      check (
        (truth_skill_level_min is null and truth_skill_level_max is null)
        or (
          truth_skill_level_min is not null
          and truth_skill_level_max is not null
          and case truth_skill_level_min
            when 'beginner'::skill_level_type then 1
            when 'intermediate'::skill_level_type then 2
            when 'advanced'::skill_level_type then 3
          end
          <= case truth_skill_level_max
            when 'beginner'::skill_level_type then 1
            when 'intermediate'::skill_level_type then 2
            when 'advanced'::skill_level_type then 3
          end
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'products'::regclass
      and conname = 'chk_products_truth_flex'
  ) then
    alter table products add constraint chk_products_truth_flex
      check (truth_flex is null or truth_flex between 1 and 10);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'products'::regclass
      and conname = 'chk_products_truth_coherence'
  ) then
    alter table products add constraint chk_products_truth_coherence
      check (
        (
          truth_model_version is null
          and truth_riding_styles is null
          and truth_skill_level_min is null
          and truth_skill_level_max is null
          and truth_board_line is null
          and truth_flex is null
          and truth_shape_type is null
          and truth_camber_profile is null
          and truth_attribute_evidence is null
        )
        or (
          truth_model_version = 2
          and truth_attribute_evidence is not null
          and jsonb_typeof(truth_attribute_evidence) = 'object'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'products'::regclass
      and conname = 'fk_products_family_id'
  ) then
    alter table products
      add constraint fk_products_family_id
      foreign key (family_id)
      references model_families(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'products'::regclass
      and conname = 'chk_products_family_member_role'
  ) then
    alter table products
      add constraint chk_products_family_member_role
      check (
        family_member_role is null
        or family_member_role in ('base', 'wide', 'other')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'products'::regclass
      and conname = 'chk_products_family_match_confidence'
  ) then
    alter table products
      add constraint chk_products_family_match_confidence
      check (
        family_match_confidence is null
        or family_match_confidence in ('high', 'reviewed')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'products'::regclass
      and conname = 'chk_products_family_membership_coherence'
  ) then
    alter table products
      add constraint chk_products_family_membership_coherence
      check (
        (
          family_id is null
          and family_member_role is null
        )
        or
        (
          family_id is not null
          and family_member_role is not null
          and family_match_method is not null
          and family_match_confidence is not null
          and family_matched_at is not null
        )
      );
  end if;
end $$;

create table if not exists product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  size_cm numeric(5, 1) not null,
  size_label text,
  waist_width_mm integer not null,
  recommended_weight_min integer not null,
  recommended_weight_max integer,
  width_type width_type not null,
  is_available boolean not null default true,
  truth_model_version smallint,
  truth_waist_width_mm integer,
  truth_width_type width_type,
  truth_attribute_evidence jsonb
);

alter table product_sizes
  add column if not exists size_label text;

alter table product_sizes
  add column if not exists is_available boolean not null default true;

alter table product_sizes
  alter column recommended_weight_max drop not null;

alter table product_sizes
  add column if not exists truth_model_version smallint,
  add column if not exists truth_waist_width_mm integer,
  add column if not exists truth_width_type width_type,
  add column if not exists truth_attribute_evidence jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'product_sizes'::regclass
      and conname = 'chk_product_sizes_truth_version'
  ) then
    alter table product_sizes add constraint chk_product_sizes_truth_version
      check (truth_model_version is null or truth_model_version = 2);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'product_sizes'::regclass
      and conname = 'chk_product_sizes_truth_evidence_object'
  ) then
    alter table product_sizes add constraint chk_product_sizes_truth_evidence_object
      check (
        truth_attribute_evidence is null
        or jsonb_typeof(truth_attribute_evidence) = 'object'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'product_sizes'::regclass
      and conname = 'chk_product_sizes_truth_geometry'
  ) then
    alter table product_sizes add constraint chk_product_sizes_truth_geometry
      check (
        (
          truth_waist_width_mm is null
          and truth_width_type is null
        )
        or (
          truth_waist_width_mm between 120 and 340
          and truth_width_type is not null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'product_sizes'::regclass
      and conname = 'chk_product_sizes_truth_coherence'
  ) then
    alter table product_sizes add constraint chk_product_sizes_truth_coherence
      check (
        (
          truth_model_version is null
          and truth_waist_width_mm is null
          and truth_width_type is null
          and truth_attribute_evidence is null
        )
        or (
          truth_model_version = 2
          and truth_attribute_evidence is not null
          and jsonb_typeof(truth_attribute_evidence) = 'object'
        )
      );
  end if;
end $$;

create table if not exists quiz_results (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  height_cm numeric(5, 1) not null,
  weight_kg numeric(5, 1) not null,
  boot_size_eu numeric(4, 1) not null,
  board_line_preference board_line_preference_type not null,
  riding_style riding_style_type not null,
  skill_level skill_level_type not null,
  terrain_priority terrain_priority_type not null default 'balanced',
  aggressiveness aggressiveness_type not null,
  stance_type stance_type not null,
  result_length_min smallint not null,
  result_length_max smallint not null,
  result_width_type width_type not null,
  result_target_waist_width_mm integer not null,
  result_boot_drag_risk boot_drag_risk_type not null,
  algorithm_version text not null,
  recommended_snapshot jsonb not null default '[]'::jsonb,
  public_token_hash text,
  result_snapshot jsonb,
  created_at timestamptz not null default now()
);

alter table quiz_results
  add column if not exists terrain_priority terrain_priority_type not null default 'balanced';

alter table quiz_results
  add column if not exists public_token_hash text;

alter table quiz_results
  add column if not exists result_snapshot jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_quiz_results_public_token_hash'
  ) then
    alter table quiz_results
      add constraint chk_quiz_results_public_token_hash
      check (
        public_token_hash is null
        or public_token_hash ~ '^sha256:[0-9a-f]{64}$'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_quiz_results_result_snapshot_object'
  ) then
    alter table quiz_results
      add constraint chk_quiz_results_result_snapshot_object
      check (
        result_snapshot is null
        or jsonb_typeof(result_snapshot) = 'object'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_quiz_results_saved_result_coherence'
  ) then
    alter table quiz_results
      add constraint chk_quiz_results_saved_result_coherence
      check (
        (public_token_hash is null and result_snapshot is null)
        or (public_token_hash is not null and result_snapshot is not null)
      );
  end if;
end $$;

create table if not exists email_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null,
  quiz_result_id uuid references quiz_results(id) on delete set null,
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  event_name text not null,
  page_path text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists analytics_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  logical_id text not null unique,
  kind text not null,
  as_of_date date not null,
  period_start date not null,
  period_end date not null,
  digest jsonb not null,
  digest_status text not null,
  evidence_hash text not null,
  content_hash text not null,
  delivery_status text not null default 'pending',
  attempt_count integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  provider_message_id text,
  last_error_category text,
  last_failure_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_analytics_digest_deliveries_kind
    check (kind in ('daily', 'weekly')),
  constraint chk_analytics_digest_deliveries_digest_status
    check (digest_status in ('complete', 'partial')),
  constraint chk_analytics_digest_deliveries_delivery_status
    check (delivery_status in ('pending', 'sending', 'sent', 'partial_sent', 'failed', 'conflict')),
  constraint chk_analytics_digest_deliveries_attempt_count
    check (attempt_count >= 0),
  constraint chk_analytics_digest_deliveries_period
    check (period_start <= period_end and as_of_date = period_end),
  constraint chk_analytics_digest_deliveries_digest_object
    check (jsonb_typeof(digest) = 'object'),
  constraint chk_analytics_digest_deliveries_evidence_hash
    check (evidence_hash ~ '^sha256:[0-9a-f]{64}$'),
  constraint chk_analytics_digest_deliveries_content_hash
    check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  constraint chk_analytics_digest_deliveries_digest_identity
    check (
      digest ->> 'logicalId' = logical_id
      and digest #>> '{delivery,contentHash}' = content_hash
      and digest #>> '{sourceReport,evidenceHash}' = evidence_hash
    )
);

create index if not exists idx_products_active on products(is_active);
create index if not exists idx_products_style_level on products(riding_style, skill_level);
create index if not exists idx_products_shape on products(shape_type);
create index if not exists idx_products_status on products(data_status, is_active);
create index if not exists idx_products_family_id on products(family_id);
create unique index if not exists uq_products_one_base_per_family
  on products(family_id)
  where family_id is not null
    and family_member_role = 'base';
create index if not exists idx_product_sizes_product on product_sizes(product_id);
create index if not exists idx_product_sizes_lookup on product_sizes(size_cm, waist_width_mm, width_type);
create index if not exists idx_quiz_results_created_at on quiz_results(created_at desc);
create unique index if not exists uq_quiz_results_public_token_hash
  on quiz_results(public_token_hash)
  where public_token_hash is not null;
create index if not exists idx_email_leads_created_at on email_leads(created_at desc);
create index if not exists idx_analytics_events_created_at on analytics_events(created_at desc);
create index if not exists idx_analytics_events_name on analytics_events(event_name, created_at desc);
create index if not exists idx_analytics_events_session on analytics_events(session_id, created_at desc);
create index if not exists idx_analytics_digest_deliveries_retry
  on analytics_digest_deliveries(delivery_status, next_attempt_at);
create index if not exists idx_analytics_digest_deliveries_created_at
  on analytics_digest_deliveries(created_at);
