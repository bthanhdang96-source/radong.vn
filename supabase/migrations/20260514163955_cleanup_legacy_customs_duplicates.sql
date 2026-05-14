with ranked as (
    select
        id,
        row_number() over (
            partition by source_name, raw_payload ->> 'dedupeKey'
            order by recorded_at desc, id desc
        ) as row_rank
    from public.price_observations
    where source_name = 'customs'
      and raw_payload ? 'dedupeKey'
)
delete from public.price_observations target
using ranked
where target.id = ranked.id
  and ranked.row_rank > 1;

select public.refresh_curated_views();
