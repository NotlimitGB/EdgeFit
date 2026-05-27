export async function normalizeCatalogWaistWidths(sql) {
  const rows = await sql`
    with normalized as (
      select
        ps.id,
        ps.waist_width_mm as old_waist_width_mm,
        case
          when ps.waist_width_mm between 1000 and 4000 then round(ps.waist_width_mm / 10.0)::int
          when ps.waist_width_mm > 0 and ps.waist_width_mm < 100 then (ps.waist_width_mm * 10)::int
          when ps.size_cm >= 140 and ps.waist_width_mm between 100 and 199 then (ps.waist_width_mm + 100)::int
          else ps.waist_width_mm
        end as new_waist_width_mm
      from product_sizes ps
      where ps.waist_width_mm between 1000 and 4000
         or (ps.waist_width_mm > 0 and ps.waist_width_mm < 100)
         or (ps.size_cm >= 140 and ps.waist_width_mm between 100 and 199)
    )
    update product_sizes ps
    set
      waist_width_mm = normalized.new_waist_width_mm,
      width_type = case
        when normalized.new_waist_width_mm >= 264 then 'wide'::width_type
        when normalized.new_waist_width_mm >= 257 then 'mid-wide'::width_type
        else 'regular'::width_type
      end
    from normalized
    where ps.id = normalized.id
      and normalized.new_waist_width_mm <> normalized.old_waist_width_mm
    returning
      ps.id::text as id,
      ps.size_cm::float8 as "sizeCm",
      ps.size_label as "sizeLabel",
      normalized.old_waist_width_mm as "oldWaistWidthMm",
      ps.waist_width_mm as "waistWidthMm",
      ps.width_type as "widthType"
  `;

  return rows;
}
