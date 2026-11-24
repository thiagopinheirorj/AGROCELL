-- Migração 1.5.0: histórico de e-mails enviados pelo sistema (botões Enviar por e-mail e avisos automáticos).
-- Guarda quem enviou, quando, para qual e-mail, o assunto, o texto e se deu certo ou falhou. O PDF não é guardado (pode ser gerado de novo).
-- Só as funções de e-mail (chave de serviço) gravam. Administrador e técnico leem; só o administrador apaga (exclusão de cliente/lead).
-- O cliente nunca lê. É seguro rodar de novo.
create table if not exists public.emails_enviados (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  usuario_id uuid,
  usuario_nome text not null,
  tipo text not null check (tipo in ('os','cobranca','proposta','aviso','resumo')),
  ref text,
  cli text,
  para text not null,
  assunto text not null,
  texto text not null,
  anexo text,
  status text not null check (status in ('enviado','falhou')),
  erro text
);
create index if not exists emails_enviados_ref_idx on public.emails_enviados (tipo, ref, em desc);
create index if not exists emails_enviados_cli_idx on public.emails_enviados (cli);
alter table public.emails_enviados enable row level security;
revoke all on table public.emails_enviados from anon, authenticated;
grant select, delete on table public.emails_enviados to authenticated;
drop policy if exists emails_ler on public.emails_enviados;
create policy emails_ler on public.emails_enviados for select to authenticated
  using (app_priv.papel() in ('admin','tecnico'));
drop policy if exists emails_apagar on public.emails_enviados;
create policy emails_apagar on public.emails_enviados for delete to authenticated
  using (app_priv.papel() = 'admin');
