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
