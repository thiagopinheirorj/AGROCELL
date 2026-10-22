-- Esquema do banco da Agrocel (aplicado igual no projeto real e no de teste).
create schema if not exists app_priv;

create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  papel text not null check (papel in ('admin','tecnico','cliente')),
  cliente_id text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint cliente_precisa_empresa check (papel <> 'cliente' or cliente_id is not null)
);

create table public.registros (
  tipo text not null check (tipo in ('clientes','certs','visitas','cobrancas','docs','proprios','fotos')),
  id text not null,
  cli text,
  data jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (tipo, id)
);
create index registros_cli_idx on public.registros (cli);

create or replace function app_priv.papel() returns text
language sql stable security definer set search_path = '' as
$$ select papel from public.perfis where id = auth.uid() and ativo $$;

create or replace function app_priv.cliente() returns text
language sql stable security definer set search_path = '' as
$$ select cliente_id from public.perfis where id = auth.uid() and ativo and papel = 'cliente' $$;

grant usage on schema app_priv to authenticated;
grant execute on function app_priv.papel() to authenticated;
grant execute on function app_priv.cliente() to authenticated;

alter table public.perfis enable row level security;
alter table public.registros enable row level security;

create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or app_priv.papel() = 'admin');
create policy perfis_admin_alterar on public.perfis for update to authenticated
  using (app_priv.papel() = 'admin') with check (app_priv.papel() = 'admin');
create policy perfis_admin_apagar on public.perfis for delete to authenticated
  using (app_priv.papel() = 'admin' and id <> auth.uid());

create policy reg_ler on public.registros for select to authenticated using (
  app_priv.papel() = 'admin'
  or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos'))
  or (app_priv.papel() = 'cliente' and cli = app_priv.cliente()
      and tipo in ('clientes','certs','visitas','docs','cobrancas','fotos'))
);
create policy reg_inserir on public.registros for insert to authenticated with check (
  app_priv.papel() = 'admin'
  or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos'))
);
create policy reg_atualizar on public.registros for update to authenticated
  using (
    app_priv.papel() = 'admin'
    or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos'))
  )
  with check (
    app_priv.papel() = 'admin'
    or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos'))
  );
create policy reg_apagar on public.registros for delete to authenticated using (
  app_priv.papel() = 'admin'
  or (app_priv.papel() = 'tecnico' and tipo = 'fotos')
);

create or replace function public.assinar_visita(p_id text, p_nome text, p_img text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.registros;
begin
  if app_priv.papel() <> 'cliente' then raise exception 'Apenas o cliente assina pela área do cliente'; end if;
  select * into r from public.registros where tipo = 'visitas' and id = p_id and cli = app_priv.cliente();
  if not found then raise exception 'Ordem de serviço não encontrada'; end if;
  if r.data->>'status' = 'assinada' then raise exception 'Ordem de serviço já assinada'; end if;
  if coalesce(trim(p_nome),'') = '' or coalesce(p_img,'') = '' then raise exception 'Informe o nome e a assinatura'; end if;
  update public.registros set
    data = r.data || jsonb_build_object('status','assinada','assinatura', jsonb_build_object(
      'nome', trim(p_nome), 'img', p_img, 'em', to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS'),
      'cod', upper(substr(md5(random()::text || clock_timestamp()::text),1,8)))),
    atualizado_em = now(), atualizado_por = auth.uid()
  where tipo = 'visitas' and id = p_id
  returning data into r.data;
  return r.data;
end $$;
revoke all on function public.assinar_visita(text,text,text) from public, anon;
grant execute on function public.assinar_visita(text,text,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos','anexos', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']);

create policy anexos_ler on storage.objects for select to authenticated using (
  bucket_id = 'anexos' and (
    app_priv.papel() in ('admin','tecnico')
    or (app_priv.papel() = 'cliente' and (storage.foldername(name))[1] = app_priv.cliente())
  )
);
create policy anexos_enviar on storage.objects for insert to authenticated with check (
  bucket_id = 'anexos' and app_priv.papel() in ('admin','tecnico')
);
create policy anexos_apagar on storage.objects for delete to authenticated using (
  bucket_id = 'anexos' and app_priv.papel() in ('admin','tecnico')
);

-- ---------------------------------------------------------------------------
-- Registro de atividade (quem fez o quê). Só o admin lê; ninguém altera nem apaga.
-- ---------------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  usuario_id uuid,
  usuario_nome text not null,
  papel text,
  acao text not null,
  tipo text not null,
  registro_id text,
  cli text,
  resumo text not null,
  campos text
);
create index auditoria_em_idx on public.auditoria (em desc);
alter table public.auditoria enable row level security;
create policy auditoria_ler on public.auditoria for select to authenticated using (app_priv.papel() = 'admin');
revoke insert, update, delete, truncate on public.auditoria from authenticated, anon;

create or replace function app_priv.resumo_registro(p_tipo text, p_data jsonb) returns text
language sql immutable set search_path = '' as $$
  select case p_tipo
    when 'clientes' then 'Cliente: ' || coalesce(nullif(p_data->>'fantasia',''), p_data->>'nome', '?')
    when 'certs' then 'Certificado: ' || coalesce(p_data->>'tipo','?') || ' (validade ' || coalesce(p_data->>'venc','?') || ')'
    when 'visitas' then 'Ordem de serviço ' || coalesce(p_data->>'os','?')
    when 'cobrancas' then 'Cobrança: ' || coalesce(p_data->>'desc','?')
    when 'docs' then 'Documento: ' || coalesce(p_data->>'nome','?')
    when 'proprios' then 'Documento da empresa: ' || coalesce(p_data->>'nome','?')
    when 'fotos' then 'Foto: ' || coalesce(p_data->>'nome','?')
    else p_tipo end
$$;

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
  insert into public.auditoria(usuario_id, usuario_nome, papel, acao, tipo, registro_id, cli, resumo, campos)
  values (auth.uid(), coalesce(u.nome, 'Sistema'), u.papel, a, r.tipo, r.id, r.cli, app_priv.resumo_registro(r.tipo, r.data), campos);
  return null;
end $$;
create trigger registros_auditoria after insert or update or delete on public.registros
  for each row execute function app_priv.auditar_registro();

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
  insert into public.auditoria(usuario_id, usuario_nome, papel, acao, tipo, registro_id, cli, resumo)
  values (auth.uid(), coalesce(u.nome,'Sistema'), u.papel, a, 'usuarios', r.id::text, r.cliente_id, 'Usuário ' || r.nome || ' (' || r.papel || ')');
  return null;
end $$;
create trigger perfis_auditoria after update or delete on public.perfis
  for each row execute function app_priv.auditar_perfil();

create or replace function public.registrar_acesso() returns void
language plpgsql security definer set search_path = '' as $$
declare u public.perfis;
begin
  select * into u from public.perfis where id = auth.uid() and ativo;
  if not found then return; end if;
  insert into public.auditoria(usuario_id, usuario_nome, papel, acao, tipo, resumo)
  values (u.id, u.nome, u.papel, 'entrou', 'acesso', 'Entrou no sistema');
end $$;
revoke all on function public.registrar_acesso() from public, anon;
grant execute on function public.registrar_acesso() to authenticated;

-- Evento manual no registro de atividade (usado ao restaurar um backup). Só o administrador.
create or replace function public.registrar_evento(p_acao text, p_resumo text) returns void
language plpgsql security definer set search_path = '' as $$
declare u public.perfis;
begin
  select * into u from public.perfis where id = auth.uid() and ativo and papel = 'admin';
  if not found then raise exception 'Somente o administrador registra eventos'; end if;
  insert into public.auditoria(usuario_id, usuario_nome, papel, acao, tipo, resumo)
  values (u.id, u.nome, u.papel, left(coalesce(p_acao, 'evento'), 40), 'sistema', left(coalesce(p_resumo, ''), 300));
end $$;
revoke all on function public.registrar_evento(text, text) from public, anon;
grant execute on function public.registrar_evento(text, text) to authenticated;
