drop policy if exists "public read world coffee benchmark fact" on public.fact_world_coffee_benchmark;
create policy "public read world coffee benchmark fact"
    on public.fact_world_coffee_benchmark
    for select
    to anon, authenticated
    using (true);

drop policy if exists "service manage world coffee benchmark fact" on public.fact_world_coffee_benchmark;
create policy "service manage world coffee benchmark fact"
    on public.fact_world_coffee_benchmark
    for all
    to service_role
    using ((select auth.role()) = 'service_role')
    with check ((select auth.role()) = 'service_role');

drop policy if exists "service manage raw competitor coffee export rows" on public.raw_un_comtrade_coffee_exports_multi_reporter;
create policy "service manage raw competitor coffee export rows"
    on public.raw_un_comtrade_coffee_exports_multi_reporter
    for all
    to service_role
    using ((select auth.role()) = 'service_role')
    with check ((select auth.role()) = 'service_role');

drop policy if exists "public read competitor export unit value fact" on public.fact_competitor_export_unit_value;
create policy "public read competitor export unit value fact"
    on public.fact_competitor_export_unit_value
    for select
    to anon, authenticated
    using (true);

drop policy if exists "service manage competitor export unit value fact" on public.fact_competitor_export_unit_value;
create policy "service manage competitor export unit value fact"
    on public.fact_competitor_export_unit_value
    for all
    to service_role
    using ((select auth.role()) = 'service_role')
    with check ((select auth.role()) = 'service_role');
