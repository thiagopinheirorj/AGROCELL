-- Verificação de segurança dos projetos Supabase (somente leitura).
-- Rode a MESMA consulta nos dois projetos (real e teste) e compare os valores de policies, functions, triggers, rls e bucket:
-- se forem diferentes, os projetos saíram de sincronia e o teste deixou de provar que o real está certo.
-- As três últimas linhas (usuarios, nunca_entraram, registros) só interessam ao projeto real.

select 'policies' as item, md5(string_agg(schemaname || tablename || policyname || cmd || roles::text || coalesce(qual, '') || coalesce(with_check, ''), '|' order by schemaname, tablename, policyname)) as valor
  from pg_policies where schemaname = 'public' or (schemaname = 'storage' and policyname like 'anexos%')
union all
select 'functions', md5(string_agg(n.nspname || p.proname || pg_get_functiondef(p.oid), '|' order by n.nspname, p.proname))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'app_priv')
union all
select 'triggers', string_agg(tgrelid::regclass::text || ':' || tgname || ':' || tgenabled, ', ' order by tgname)
  from pg_trigger where not tgisinternal and tgrelid in ('public.registros'::regclass, 'public.perfis'::regclass)
union all
select 'rls', string_agg(relname || ':' || relrowsecurity::text, ', ' order by relname)
  from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
union all
select 'bucket', coalesce(string_agg(id || ':publico=' || public::text || ':limite=' || coalesce(file_size_limit::text, '') || ':tipos=' || coalesce(allowed_mime_types::text, ''), ', '), '')
  from storage.buckets
union all
select 'usuarios', coalesce(string_agg(papel || ':' || (case when ativo then 'ativo' else 'inativo' end) || '=' || n, ', '), '')
  from (select papel, ativo, count(*) n from public.perfis group by 1, 2 order by 1, 2) x
union all
select 'nunca_entraram', count(*)::text
  from public.perfis p join auth.users u on u.id = p.id where u.last_sign_in_at is null
union all
select 'registros', (select count(*) from public.registros)::text || ' registros, ' || (select count(*) from public.auditoria)::text || ' linhas no registro de atividade';
