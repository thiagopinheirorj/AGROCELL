-- Migração 1.4.0: controle dos avisos automáticos de vencimento (e-mail).
-- A tabela guarda quais avisos (30 e 15 dias) já foram enviados, para nunca mandar o mesmo aviso duas vezes.
-- Só a função avisos-vencimento (chave de serviço) lê e grava aqui; ninguém pela API do app. É seguro rodar de novo.
create table if not exists public.avisos_enviados (
  cert_id text not null,
  marco integer not null check (marco in (15, 30)),
  enviado_em timestamptz not null default now(),
  para_cliente boolean not null default false,
  primary key (cert_id, marco)
);
alter table public.avisos_enviados enable row level security;
revoke all on table public.avisos_enviados from anon, authenticated;
