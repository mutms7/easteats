-- Application credentials are encrypted in Vault. No secret values belong in SQL.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create function private.configure_worker_secrets(p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item record; secret_id uuid; secret_name text;
begin
  if jsonb_typeof(p_values) is distinct from 'object' or octet_length(p_values::text)>64000 then raise exception 'Invalid worker configuration'; end if;
  perform pg_advisory_xact_lock(hashtextextended('east_eats:worker-secrets',0));
  for item in select key,value from jsonb_each(p_values) loop
    if item.key<>all(array['APIFY_TOKEN','ANTHROPIC_API_KEY','ANTHROPIC_EXTRACT_MODEL','WORKER_SECRET','APIFY_WEBHOOK_SECRET','SUPABASE_URL']) then raise exception 'Unsupported worker configuration key'; end if;
    if jsonb_typeof(item.value)<>'string' or length(trim(item.value#>>'{}'))=0 or length(item.value#>>'{}')>16000 then raise exception 'Invalid worker configuration value'; end if;
    if item.key='SUPABASE_URL' and (item.value#>>'{}')!~'^https://[a-z0-9-]+\.supabase\.co/?$' then raise exception 'Invalid Supabase project URL'; end if;
    if item.key in ('WORKER_SECRET','APIFY_WEBHOOK_SECRET') and length(item.value#>>'{}')<32 then raise exception 'Worker shared secrets must have at least 32 characters'; end if;
    secret_name:='east_eats_'||item.key;
    select id into secret_id from vault.secrets where name=secret_name;
    if secret_id is null then perform vault.create_secret(item.value#>>'{}',secret_name,'East Eats worker configuration');
    else perform vault.update_secret(secret_id,item.value#>>'{}',secret_name,'East Eats worker configuration'); end if;
  end loop;
end;$$;
revoke execute on function private.configure_worker_secrets(jsonb) from public,anon,authenticated;
grant execute on function private.configure_worker_secrets(jsonb) to service_role;
create function public.configure_worker_secrets(p_values jsonb) returns void language sql security invoker set search_path='' as $$select private.configure_worker_secrets(p_values);$$;
revoke execute on function public.configure_worker_secrets(jsonb) from public,anon,authenticated;
grant execute on function public.configure_worker_secrets(jsonb) to service_role;

create function private.get_worker_secrets() returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_object_agg(substring(name from 11),decrypted_secret),'{}'::jsonb) from vault.decrypted_secrets where name=any(array['east_eats_APIFY_TOKEN','east_eats_ANTHROPIC_API_KEY','east_eats_ANTHROPIC_EXTRACT_MODEL','east_eats_WORKER_SECRET','east_eats_APIFY_WEBHOOK_SECRET','east_eats_SUPABASE_URL']);$$;
revoke execute on function private.get_worker_secrets() from public,anon,authenticated;
grant execute on function private.get_worker_secrets() to service_role;
create function public.get_worker_secrets() returns jsonb language sql stable security invoker set search_path='' as $$select private.get_worker_secrets();$$;
revoke execute on function public.get_worker_secrets() from public,anon,authenticated;
grant execute on function public.get_worker_secrets() to service_role;

-- API roles cannot reach plaintext Vault or the transient outbound request headers.
revoke usage on schema vault from public,anon,authenticated;
revoke all on vault.secrets,vault.decrypted_secrets from public,anon,authenticated;
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;

create function private.dispatch_refresh_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare config jsonb; endpoint text; request_id bigint;
begin
  config:=private.get_worker_secrets();
  if coalesce(config->>'SUPABASE_URL','')='' or coalesce(config->>'WORKER_SECRET','')='' then return null; end if;
  if not exists(select 1 from private.refresh_jobs where status in ('queued','starting','running','ingesting')) then return null; end if;
  endpoint:=rtrim(config->>'SUPABASE_URL','/')||'/functions/v1/refresh-worker';
  select net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','x-worker-secret',config->>'WORKER_SECRET'),body:='{}'::jsonb,timeout_milliseconds:=10000) into request_id;
  return request_id;
end;$$;
revoke execute on function private.dispatch_refresh_worker() from public,anon,authenticated;
grant execute on function private.dispatch_refresh_worker() to service_role;
select cron.schedule('east-eats-refresh-worker','* * * * *','select private.dispatch_refresh_worker();');

create function private.record_refresh_error(p_id uuid,p_code text) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_code<>all(array['MODEL_INVALID_RESPONSE','PROVIDER','DATABASE','UNKNOWN']) then raise exception 'Invalid processing error code'; end if;
  update private.refresh_jobs set error='Refresh processing failed ('||p_code||')',updated_at=now() where id=p_id;
end;$$;
revoke execute on function private.record_refresh_error(uuid,text) from public,anon,authenticated;
grant execute on function private.record_refresh_error(uuid,text) to service_role;
create function public.record_refresh_error(p_id uuid,p_code text) returns void language sql security invoker set search_path='' as $$select private.record_refresh_error(p_id,p_code);$$;
revoke execute on function public.record_refresh_error(uuid,text) from public,anon,authenticated;
grant execute on function public.record_refresh_error(uuid,text) to service_role;
