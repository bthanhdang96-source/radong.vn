create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to service_role;

create or replace function public.refresh_curated_views()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform private.refresh_curated_views();
end;
$$;

revoke all on function public.refresh_curated_views() from public;
grant execute on function public.refresh_curated_views() to service_role;
