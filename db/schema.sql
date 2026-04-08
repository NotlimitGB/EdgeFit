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

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  brand text not null,
  model_name text not null,
  description_short text not null,
  description_full text not null,
  riding_style riding_style_type not null,
  skill_level skill_level_type not null,
  flex smallint not null check (flex between 1 and 10),
  price_from integer not null,
  image_url text not null,
  affiliate_url text not null,
  is_active boolean not null default true,
  board_line board_line_type not null default 'unisex',
  shape_type board_shape_type,
  data_status product_data_status_type not null default 'draft',
  source_name text,
  source_url text,
  source_checked_at date,
  scenarios jsonb not null default '[]'::jsonb,
  not_ideal_for jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table products
  add column if not exists shape_type board_shape_type;

alter table products
  add column if not exists data_status product_data_status_type not null default 'draft';

alter table products
  add column if not exists source_name text;

alter table products
  add column if not exists source_url text;

alter table products
  add column if not exists source_checked_at date;

create table if not exists product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  size_cm numeric(5, 1) not null,
  size_label text,
  waist_width_mm integer not null,
  recommended_weight_min integer not null,
  recommended_weight_max integer,
  width_type width_type not null
);

alter table product_sizes
  add column if not exists size_label text;

alter table product_sizes
  alter column recommended_weight_max drop not null;

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
  created_at timestamptz not null default now()
);

alter table quiz_results
  add column if not exists terrain_priority terrain_priority_type not null default 'balanced';

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

create index if not exists idx_products_active on products(is_active);
create index if not exists idx_products_style_level on products(riding_style, skill_level);
create index if not exists idx_products_shape on products(shape_type);
create index if not exists idx_products_status on products(data_status, is_active);
create index if not exists idx_product_sizes_product on product_sizes(product_id);
create index if not exists idx_product_sizes_lookup on product_sizes(size_cm, waist_width_mm, width_type);
create index if not exists idx_quiz_results_created_at on quiz_results(created_at desc);
create index if not exists idx_email_leads_created_at on email_leads(created_at desc);
create index if not exists idx_analytics_events_created_at on analytics_events(created_at desc);
create index if not exists idx_analytics_events_name on analytics_events(event_name, created_at desc);
create index if not exists idx_analytics_events_session on analytics_events(session_id, created_at desc);
