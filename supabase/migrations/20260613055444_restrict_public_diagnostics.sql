revoke select on public.vw_coffee_market_event_brief_candidates from anon, authenticated;
revoke select on public.vw_coffee_market_event_review_queue from anon, authenticated;
revoke select on public.vw_coffee_freight_logistics_review_queue from anon, authenticated;

grant select on public.vw_coffee_market_event_brief_candidates to service_role;
grant select on public.vw_coffee_market_event_review_queue to service_role;
grant select on public.vw_coffee_freight_logistics_review_queue to service_role;
