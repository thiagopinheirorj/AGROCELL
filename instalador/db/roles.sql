-- Define a senha dos papéis internos do Supabase com a senha do banco (roda só na primeira vez).
-- Nem todo papel existe em toda versão da imagem; por isso só altera os que existem.
\set pgpass `echo "$POSTGRES_PASSWORD"`
select format('ALTER USER %I WITH PASSWORD %L', rolname, :'pgpass')
from pg_roles
where rolname in ('authenticator','pgbouncer','supabase_auth_admin','supabase_functions_admin','supabase_storage_admin')
\gexec
