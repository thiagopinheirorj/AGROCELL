-- Agenda a rotina diária dos avisos de vencimento (nuvem, Supabase). NÃO roda sozinho com as migrações.
-- Antes, no painel do Supabase:
--   1) Edge Functions > Secrets: GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_RESPONSAVEL, CRON_SECRET (um texto longo e aleatório).
--   2) Publicar a função avisos-vencimento com verify_jwt DESLIGADO (o agendador não tem login; a proteção é o x-cron-secret).
-- Depois rode este arquivo trocando <REF_DO_PROJETO> e <MESMO_CRON_SECRET> (o mesmo valor do segredo da função).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda o segredo no cofre do banco (só a rotina lê).
select vault.create_secret('<MESMO_CRON_SECRET>', 'cron_secret');

-- Todo dia às 11:00 UTC (08:00 em Brasília).
select cron.schedule('avisos-vencimento', '0 11 * * *', $$
  select net.http_post(
    url := 'https://<REF_DO_PROJETO>.supabase.co/functions/v1/avisos-vencimento',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb
  );
$$);

-- Para conferir:  select * from cron.job;   |   select * from cron.job_run_details order by start_time desc limit 5;
-- Para parar:     select cron.unschedule('avisos-vencimento');
-- Teste sem enviar (simulação): chame a função com o corpo {"simular": true} e o cabeçalho x-cron-secret.
