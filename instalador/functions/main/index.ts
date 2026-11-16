// Roteador das funções (igual ao do Supabase auto-hospedado): confere o token e chama a função pedida,
// por exemplo /usuarios -> pasta functions/usuarios.
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "";
const VERIFY_JWT = Deno.env.get("VERIFY_JWT") === "true";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function tokenValido(req: Request): Promise<boolean> {
  const h = req.headers.get("authorization") ?? "";
  const [tipo, token] = h.split(" ");
  if (tipo !== "Bearer" || !token) return false;
  try { await jose.jwtVerify(token, new TextEncoder().encode(JWT_SECRET)); return true; } catch { return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "OPTIONS" && VERIFY_JWT && !(await tokenValido(req))) return json({ msg: "Invalid JWT" }, 401);
  const nome = new URL(req.url).pathname.split("/")[1];
  if (!nome) return json({ msg: "missing function name in request" }, 400);
  const envVarsObj = Deno.env.toObject();
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${nome}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]),
    });
    return await worker.fetch(req);
  } catch (e) {
    return json({ msg: String(e) }, 500);
  }
});
