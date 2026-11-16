-- Segredo dos tokens de login, usado pelo banco para conferir quem está logado (roda só na primeira vez).
\set jwt_secret `echo "$JWT_SECRET"`
\set jwt_exp `echo "$JWT_EXP"`
ALTER DATABASE postgres SET "app.settings.jwt_secret" TO :'jwt_secret';
ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';

-- O serviço de login (GoTrue) atualiza as funções auth.uid/role/email nas migrações dele e precisa ser o dono.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'auth' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO supabase_auth_admin', r.f);
  END LOOP;
END $$;
