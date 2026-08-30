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
