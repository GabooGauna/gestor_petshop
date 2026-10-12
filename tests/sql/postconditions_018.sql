do $$
begin
  if obj_description(
      'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)'::regprocedure,
      'pg_proc'
    ) is distinct from
      'Atomically creates a presentation and serializes exact decimal values as JSON strings.'
    or position(
      'pg_advisory_xact_lock(1347638356' in pg_get_functiondef(
        'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)'::regprocedure
      )
    ) = 0 then
    raise exception 'PETSTOCK_018_POSTCONDITION_FAILED';
  end if;
end $$;
