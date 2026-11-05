-- Migração 0.7.0: agendamento de visitas, rota do dia para toda a equipe e aba Leads.
-- Rode em um banco que já existe (primeiro no projeto de teste, depois no real). Em banco novo, o schema.sql já traz tudo isto.
-- O que muda:
--   1) registros aceita os tipos 'agendamentos' (visitas marcadas) e 'leads' (CRM de prospecção).
--   2) O técnico passa a ler, gravar e apagar 'agenda' (rota do dia), 'agendamentos' e 'leads' (CRM).
--   3) O cliente não lê nenhum dos três tipos.
--   4) O registro de atividade ganha o resumo dos dois tipos novos.
-- É seguro rodar de novo: usa alter policy e create or replace.

alter table public.registros drop constraint if exists registros_tipo_check;
alter table public.registros add constraint registros_tipo_check
  check (tipo in ('clientes','certs','visitas','cobrancas','docs','proprios','fotos','agenda','agendamentos','leads'));

alter policy reg_ler on public.registros using (
  app_priv.papel() = 'admin'
  or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos','agenda','agendamentos','leads'))
  or (app_priv.papel() = 'cliente' and cli = app_priv.cliente()
      and tipo in ('clientes','certs','visitas','docs','cobrancas','fotos'))
);
alter policy reg_inserir on public.registros with check (
  app_priv.papel() = 'admin'
  or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos','agenda','agendamentos','leads'))
);
alter policy reg_atualizar on public.registros
  using (
    app_priv.papel() = 'admin'
    or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos','agenda','agendamentos','leads'))
  )
  with check (
    app_priv.papel() = 'admin'
    or (app_priv.papel() = 'tecnico' and tipo in ('clientes','certs','visitas','docs','fotos','agenda','agendamentos','leads'))
  );
alter policy reg_apagar on public.registros using (
  app_priv.papel() = 'admin'
  or (app_priv.papel() = 'tecnico' and tipo in ('fotos','agenda','agendamentos','leads'))
);

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
    when 'agenda' then 'Rota do dia ' || coalesce(p_data->>'dia','?') || ' (' || coalesce(p_data->>'tecnico','?') || ')'
    when 'agendamentos' then 'Visita agendada ' || coalesce(p_data->>'dia','?') || ' (' || coalesce(p_data->>'tipo','?') || ')'
    when 'leads' then 'Lead: ' || coalesce(p_data->>'empresa','?')
    else p_tipo end
$$;
