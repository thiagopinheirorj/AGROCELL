-- Migração 0.8.0: limpeza de permissões (defesa em profundidade). Varredura de segurança de 16/11/2026.
-- O Supabase concede por padrão ao papel 'authenticated' tudo nas tabelas, inclusive INSERT em perfis e
-- TRUNCATE/REFERENCES/TRIGGER. Nada disso chega pela API (as regras RLS bloqueiam), mas não há motivo para existir.
-- Quem grava em perfis é a função 'usuarios' (chave de serviço), que não é afetada. É seguro rodar de novo.
revoke insert, truncate, references, trigger on table public.perfis from authenticated;
revoke truncate, references, trigger on table public.registros from authenticated;
revoke references, trigger on table public.auditoria from authenticated;
revoke all on table public.registros, public.perfis, public.auditoria from anon;
-- As funções de auditoria interna não precisam ser chamadas por ninguém da API.
revoke all on function app_priv.auditar_registro() from public;
revoke all on function app_priv.auditar_perfil() from public;
revoke all on function app_priv.resumo_registro(text, jsonb) from public;
