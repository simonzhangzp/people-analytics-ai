-- Quantreview's existing signup trigger requires referral metadata for normal
-- accounts. Workbench sessions are anonymous and must bypass that product flow.
do $migration$
declare
  function_oid regprocedure := to_regprocedure('public.handle_new_user()');
  function_sql text;
  patched_sql text;
begin
  if function_oid is null then
    return;
  end if;

  select pg_get_functiondef(function_oid) into function_sql;
  if function_sql like '%new.is_anonymous is true%' then
    return;
  end if;

  patched_sql := replace(
    function_sql,
    'norm_email := lower(new.email);',
    'if new.is_anonymous is true then
    return new;
  end if;

  norm_email := lower(new.email);'
  );

  if patched_sql = function_sql then
    raise exception
      'public.handle_new_user() no longer contains the expected signup prelude';
  end if;

  execute patched_sql;
end;
$migration$;
