create schema if not exists private;

create or replace function private.ensure_customs_export_temporal_metadata()
returns trigger
language plpgsql
as $$
declare
    detected_code text;
    parsed_code text[];
    detected_year integer;
    detected_month integer;
    detected_period integer;
    detected_start_date date;
    detected_end_date date;
begin
    if new.source_name = 'customs' and new.price_type = 'export' then
        detected_code = lower(coalesce(
            nullif(new.period_code, ''),
            nullif(new.raw_payload #>> '{periodCode}', ''),
            nullif(new.raw_payload #>> '{extra,periodCode}', ''),
            nullif(new.raw_payload #>> '{reportCode}', ''),
            nullif(new.raw_payload #>> '{extra,reportCode}', '')
        ));

        if detected_code is not null then
            detected_code = replace(detected_code, ' ', '');
            parsed_code = regexp_match(detected_code, '^([0-9]{4})-t([0-9]{1,2})-k([0-9]{1,2})$');
        end if;

        if parsed_code is not null then
            detected_year = parsed_code[1]::integer;
            detected_month = parsed_code[2]::integer;
            detected_period = parsed_code[3]::integer;
            detected_start_date = make_date(
                detected_year,
                detected_month,
                case when detected_period = 1 then 1 else 16 end
            );
            detected_end_date = case
                when detected_period = 1 then make_date(detected_year, detected_month, 15)
                else (date_trunc('month', make_date(detected_year, detected_month, 1)) + interval '1 month - 1 day')::date
            end;
        end if;

        new.data_granularity = 'period';
        new.temporal_coverage = 'report_period';
        new.period_type = 'customs_semimonthly';
        new.period_code = coalesce(detected_code, new.period_code);
        new.period_year = coalesce(detected_year, new.period_year);
        new.period_month = coalesce(detected_month, new.period_month);
        new.period_number = coalesce(detected_period, new.period_number);
        new.period_start_date = coalesce(detected_start_date, new.period_start_date);
        new.period_end_date = coalesce(detected_end_date, new.period_end_date);
        new.period_label = coalesce(
            case
                when detected_year is not null
                    then format('Ky %s thang %s nam %s', detected_period, detected_month, detected_year)
                else null
            end,
            nullif(new.period_label, '')
        );
        new.aggregation_method = 'unit_value_from_aggregate_quantity_value';
        new.geographic_scope = 'national';
        new.source_detail = 'customs_export_pdf_aggregate';

        new.raw_payload = coalesce(new.raw_payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'dataGranularity', new.data_granularity,
            'temporalCoverage', new.temporal_coverage,
            'periodType', new.period_type,
            'periodCode', new.period_code,
            'periodLabel', new.period_label,
            'periodYear', new.period_year,
            'periodMonth', new.period_month,
            'periodNumber', new.period_number,
            'periodStartDate', new.period_start_date,
            'periodEndDate', new.period_end_date,
            'aggregationMethod', new.aggregation_method,
            'geographicScope', new.geographic_scope,
            'sourceDetail', new.source_detail
        ));
    end if;

    return new;
end;
$$;

revoke all on function private.ensure_customs_export_temporal_metadata() from public, anon, authenticated;

drop trigger if exists trg_ensure_customs_export_temporal_metadata on public.price_observations;
create trigger trg_ensure_customs_export_temporal_metadata
before insert or update of source_name, price_type, period_code, raw_payload
on public.price_observations
for each row
execute function private.ensure_customs_export_temporal_metadata();

update public.price_observations
set raw_payload = raw_payload
where source_name = 'customs'
  and price_type = 'export';
