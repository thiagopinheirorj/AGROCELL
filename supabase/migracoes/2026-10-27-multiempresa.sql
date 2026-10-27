-- Multiempresa + avisos por e-mail (versão 0.6.0).
-- Aplicar PRIMEIRO no projeto de teste e só depois no real.
-- Tudo o que já existe no banco passa a pertencer a uma única empresa ("Minha empresa"),
-- que o administrador renomeia depois na aba "Minha empresa".

-- 1. Empresas -------------------------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  cidade text,
  telefone text,
  email_avisos text,
  logo text,                       -- imagem pequena (data URL), usada nos PDFs e na área do cliente
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint logo_pequeno check (logo is null or length(logo) <= 400000)
);
alter table public.empresas enable row level security;

insert into public.empresas (nome) values ('Minha empresa');

-- 2. Perfis ganham empresa (e a marca de quem administra a plataforma) ----------------------
alter table public.perfis add column empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.perfis add column plataforma boolean not null default false;
update public.perfis set empresa_id = (select id from public.empresas order by criado_em limit 1);
alter table public.perfis alter column empresa_id set not null;
create index perfis_empresa_idx on public.perfis (empresa_id);

create or replace function app_priv.empresa() returns uuid
language sql stable security definer set search_path = '' as
$$ select empresa_id from public.perfis where id = auth.uid() and ativo $$;
grant execute on function app_priv.empresa() to authenticated;

-- 3. Registros ganham empresa; a chave passa a incluir a empresa ----------------------------
alter table public.registros add column empresa_id uuid references public.empresas(id) on delete cascade;
update public.registros set empresa_id = (select id from public.empresas order by criado_em limit 1);
alter table public.registros alter column empresa_id set not null;
alter table public.registros alter column empresa_id set default app_priv.empresa();
alter table public.registros drop constraint registros_pkey;
alter table public.registros add primary key (empresa_id, tipo, id);

-- 4. Auditoria ganha empresa ----------------------------------------------------------------
alter table public.auditoria add column empresa_id uuid references public.empresas(id) on delete cascade;
update public.auditoria set empresa_id = (select id from public.empresas order by criado_em limit 1);
alter table public.auditoria alter column empresa_id set default app_priv.empresa();
create index auditoria_empresa_idx on public.auditoria (empresa_id, em desc);

-- 5. Regras de acesso: tudo filtrado pela empresa de quem está logado ----------------------
drop policy perfis_ler on public.perfis;
drop policy perfis_admin_alterar on public.perfis;
drop policy perfis_admin_apagar on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or (app_priv.papel() = 'admin' and empresa_id = app_priv.empresa()));
create policy perfis_admin_alterar on public.perfis for update to authenticated
  using (app_priv.papel() = 'admin' and empresa_id = app_priv.empresa())
  with check (app_priv.papel() = 'admin' and empresa_id = app_priv.empresa());
create policy perfis_admin_apagar on public.perfis for delete to authenticated
  using (app_priv.papel() = 'admin' and empresa_id = app_priv.empresa() and id <> auth.uid());
-- Pelo app, só dá para mudar nome e situação (ativo). Papel, empresa e "plataforma" só pelo servidor.
revoke update on public.perfis from authenticated;
grant update (nome, ativo) on public.perfis to authenticated;

drop policy reg_ler on public.registros;
drop policy reg_inserir on public.registros;
drop policy reg_atualizar on public.registros;
drop policy reg_apagar on public.registros;
create policy reg_ler on public.registros for select to authenticated using (
  empresa_id = app_priv.empresa() and (
    app_priv.papel() = 'admin'
    or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos'))
    or (app_priv.papel() = 'cliente' and cli = app_priv.cliente()
        and tipo in ('clientes','certs','visitas','docs','cobrancas','fotos'))
  )
);
create policy reg_inserir on public.registros for insert to authenticated with check (
  empresa_id = app_priv.empresa() and (
    app_priv.papel() = 'admin'
    or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos'))
  )
);
create policy reg_atualizar on public.registros for update to authenticated
  using (
    empresa_id = app_priv.empresa() and (
      app_priv.papel() = 'admin'
      or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos'))
    )
  )
  with check (
    empresa_id = app_priv.empresa() and (
      app_priv.papel() = 'admin'
      or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos'))
    )
  );
create policy reg_apagar on public.registros for delete to authenticated using (
  empresa_id = app_priv.empresa() and (
    app_priv.papel() = 'admin'
    or (app_priv.papel() = 'tecnico' and tipo = 'fotos')
  )
);

drop policy auditoria_ler on public.auditoria;
create policy auditoria_ler on public.auditoria for select to authenticated
  using (app_priv.papel() = 'admin' and empresa_id = app_priv.empresa());

create policy empresas_ler on public.empresas for select to authenticated using (id = app_priv.empresa());
create policy empresas_admin_alterar on public.empresas for update to authenticated
  using (id = app_priv.empresa() and app_priv.papel() = 'admin')
  with check (id = app_priv.empresa() and app_priv.papel() = 'admin');
revoke insert, update, delete, truncate on public.empresas from authenticated, anon;
grant update (nome, cnpj, cidade, telefone, email_avisos, logo) on public.empresas to authenticated;

-- 6. Assinatura do cliente: só dentro da própria empresa ------------------------------------
create or replace function public.assinar_visita(p_id text, p_nome text, p_img text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.registros;
begin
  if app_priv.papel() <> 'cliente' then raise exception 'Apenas o cliente assina pela área do cliente'; end if;
  select * into r from public.registros
   where empresa_id = app_priv.empresa() and tipo = 'visitas' and id = p_id and cli = app_priv.cliente();
  if not found then raise exception 'Ordem de serviço não encontrada'; end if;
  if r.data->>'status' = 'assinada' then raise exception 'Ordem de serviço já assinada'; end if;
  if coalesce(trim(p_nome),'') = '' or coalesce(p_img,'') = '' then raise exception 'Informe o nome e a assinatura'; end if;
  update public.registros set
    data = r.data || jsonb_build_object('status','assinada','assinatura', jsonb_build_object(
      'nome', trim(p_nome), 'img', p_img, 'em', to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS'),
      'cod', upper(substr(md5(random()::text || clock_timestamp()::text),1,8)))),
    atualizado_em = now(), atualizado_por = auth.uid()
  where empresa_id = r.empresa_id and tipo = 'visitas' and id = p_id
  returning data into r.data;
  return r.data;
end $$;

-- 7. Auditoria grava a empresa do registro ---------------------------------------------------
create or replace function app_priv.auditar_registro() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.registros; u public.perfis; a text; campos text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select * into u from public.perfis where id = auth.uid();
  if tg_op = 'INSERT' then a := 'criou';
  elsif tg_op = 'DELETE' then a := 'excluiu';
  else
    if r.tipo = 'visitas' and r.data->>'status' = 'assinada' and coalesce(old.data->>'status','') <> 'assinada' then a := 'assinou';
    else a := 'alterou'; end if;
    select string_agg(k, ', ' order by k) into campos from (
      select n.key as k from jsonb_each(new.data) n where n.value is distinct from old.data->n.key
      union
      select o.key from jsonb_each(old.data) o where not (new.data ? o.key)
    ) x;
    if campos is null then return null; end if;
  end if;
  insert into public.auditoria(empresa_id, usuario_id, usuario_nome, papel, acao, tipo, registro_id, cli, resumo, campos)
  values (r.empresa_id, auth.uid(), coalesce(u.nome, 'Sistema'), u.papel, a, r.tipo, r.id, r.cli, app_priv.resumo_registro(r.tipo, r.data), campos);
  return null;
end $$;

create or replace function app_priv.auditar_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u public.perfis; a text; r public.perfis;
begin
  if auth.uid() is null then return null; end if;
  select * into u from public.perfis where id = auth.uid();
  if tg_op = 'DELETE' then r := old; a := 'excluiu';
  else
    r := new;
    if old.ativo is distinct from new.ativo then a := case when new.ativo then 'reativou' else 'desativou' end;
    elsif old.papel is distinct from new.papel then a := 'alterou perfil';
    else return null; end if;
  end if;
  insert into public.auditoria(empresa_id, usuario_id, usuario_nome, papel, acao, tipo, registro_id, cli, resumo)
  values (r.empresa_id, auth.uid(), coalesce(u.nome,'Sistema'), u.papel, a, 'usuarios', r.id::text, r.cliente_id, 'Usuário ' || r.nome || ' (' || r.papel || ')');
  return null;
end $$;

-- 8. Arquivos: pasta da empresa ({empresa}/{cliente}/arquivo). --------------------------------
-- Arquivos antigos ({cliente}/arquivo) continuam acessíveis só para a empresa dona daquele cliente.
create or replace function app_priv.pasta_antiga_ok(p_pasta text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.registros where tipo = 'clientes' and id = p_pasta and empresa_id = app_priv.empresa())
     and not exists (select 1 from public.registros where tipo = 'clientes' and id = p_pasta and empresa_id <> app_priv.empresa())
$$;
grant execute on function app_priv.pasta_antiga_ok(text) to authenticated;

drop policy anexos_ler on storage.objects;
drop policy anexos_enviar on storage.objects;
drop policy anexos_apagar on storage.objects;
create policy anexos_ler on storage.objects for select to authenticated using (
  bucket_id = 'anexos' and (
    (app_priv.papel() in ('admin','tecnico') and (
      (storage.foldername(name))[1] = app_priv.empresa()::text
      or app_priv.pasta_antiga_ok((storage.foldername(name))[1])))
    or (app_priv.papel() = 'cliente' and (
      ((storage.foldername(name))[1] = app_priv.empresa()::text and (storage.foldername(name))[2] = app_priv.cliente())
      or ((storage.foldername(name))[1] = app_priv.cliente() and app_priv.pasta_antiga_ok(app_priv.cliente()))))
  )
);
create policy anexos_enviar on storage.objects for insert to authenticated with check (
  bucket_id = 'anexos' and app_priv.papel() in ('admin','tecnico')
  and (storage.foldername(name))[1] = app_priv.empresa()::text
);
create policy anexos_apagar on storage.objects for delete to authenticated using (
  bucket_id = 'anexos' and app_priv.papel() in ('admin','tecnico') and (
    (storage.foldername(name))[1] = app_priv.empresa()::text
    or app_priv.pasta_antiga_ok((storage.foldername(name))[1]))
);

-- 9. Avisos por e-mail: o que já foi enviado (para nunca mandar duas vezes) -----------------
create table public.avisos_enviados (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cert_id text not null,
  cli text,
  marco int not null check (marco in (30, 15)),
  venc date not null,
  para text not null,
  situacao text not null check (situacao in ('enviado','erro')),
  erro text,
  em timestamptz not null default now()
);
create unique index avisos_um_por_marco on public.avisos_enviados (empresa_id, cert_id, venc, marco) where situacao = 'enviado';
create index avisos_empresa_idx on public.avisos_enviados (empresa_id, em desc);
alter table public.avisos_enviados enable row level security;
create policy avisos_ler on public.avisos_enviados for select to authenticated
  using (app_priv.papel() = 'admin' and empresa_id = app_priv.empresa());
revoke insert, update, delete, truncate on public.avisos_enviados from authenticated, anon;

-- Segredo do agendamento diário (guardado no Vault; a função confere sem expor o valor).
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'avisos_cron', 'Chave do agendamento diário dos avisos');
create or replace function public.avisos_chave_ok(p_chave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'avisos_cron' and decrypted_secret = p_chave)
$$;
revoke all on function public.avisos_chave_ok(text) from public, anon, authenticated;
grant execute on function public.avisos_chave_ok(text) to service_role;
