// Testes de acesso por perfil e de segurança básica. Rodam SOMENTE no ambiente de TESTE.
// Uso:  node supabase/testes-de-acesso.mjs <senha-dos-acessos-de-teste>
// Antes de começar, restaura os dados de teste (supabase/seed-teste.mjs). Sai com código 1 se algum teste falhar.
// Rode sempre antes de aplicar uma mudança de banco ou de regras no sistema real.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const URL_ = "https://fnwtbezcalgnihuckolc.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZud3RiZXpjYWxnbmlodWNrb2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MTc4MTgsImV4cCI6MjEwODE5MzgxOH0.bS4YdG_L6dc_DDkED-LsQv6-OIE2eqHOmVDn-K4Fmgs";
const senha = process.argv[2] || process.env.AGROCEL_SENHA_TESTE;
if (!senha) { console.error("Informe a senha: node supabase/testes-de-acesso.mjs <senha> (ou defina a variável AGROCEL_SENHA_TESTE)"); process.exit(1); }
const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");

console.log("Restaurando os dados de teste…");
execFileSync(process.execPath, [path.join(aqui, "seed-teste.mjs"), senha], { stdio: "ignore" });

const login = async (email) => {
  const r = await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY }, body: JSON.stringify({ email, password: senha }) });
  return (await r.json()).access_token;
};
const rest = async (tok, p, opt = {}) => {
  const r = await fetch(URL_ + "/rest/v1/" + p, { ...opt, headers: { apikey: KEY, Authorization: "Bearer " + (tok || KEY), "Content-Type": "application/json", Prefer: "return=representation", ...(opt.headers || {}) } });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const fn = async (tok, body) => {
  const r = await fetch(URL_ + "/functions/v1/usuarios", { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + (tok || KEY) }, body: JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const storage = (tok, metodo, p, corpo) => fetch(`${URL_}/storage/v1/object/${metodo === "GET" ? "authenticated/" : ""}anexos/${p}`, { method: metodo, headers: { apikey: KEY, Authorization: "Bearer " + tok, "Content-Type": "image/png" }, body: corpo }).then((x) => x.status);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const vazio = (r) => r.s >= 400 || (Array.isArray(r.j) && r.j.length === 0);

let falhas = 0, total = 0;
const ok = (nome, cond) => { total++; if (!cond) falhas++; console.log((cond ? "OK     " : "FALHOU ") + nome); };
const grupo = (t) => console.log("\n" + t);

const A = await login("admin@agrocel.teste"), T = await login("tecnico@agrocel.teste"), C = await login("cliente@agrocel.teste");
ok("os três perfis de teste entram", !!A && !!T && !!C);

grupo("Sem login");
for (const t of ["registros", "perfis", "auditoria"]) ok(`anônimo não lê ${t}`, vazio(await rest(null, `${t}?select=*`)));
ok("anônimo não grava registros", (await rest(null, "registros", { method: "POST", body: JSON.stringify([{ tipo: "clientes", id: "x", cli: "x", data: {} }]) })).s >= 400);
ok("função de usuários recusa pedido sem login", (await fn(null, { acao: "criar", nome: "x", email: "x@y.com", senha: "12345678", papel: "tecnico" })).s === 401);
ok("primeiro acesso fechado (já existe administrador)", (await fn(null, { acao: "bootstrap", nome: "x", email: "x@y.com", senha: "12345678" })).s === 403);
ok("arquivos não abrem sem login", (await fetch(`${URL_}/storage/v1/object/anexos/c1/posto-serra-verde-desratizacao.pdf`)).status >= 400);

grupo("Técnico");
let r = await rest(T, "registros?select=tipo");
const tipos = new Set(r.j.map((x) => x.tipo));
ok("técnico vê clientes e certificados", tipos.has("clientes") && tipos.has("certs"));
ok("técnico NÃO vê cobranças nem documentos da empresa", !tipos.has("cobrancas") && !tipos.has("proprios"));
ok("técnico NÃO lê o registro de atividade", vazio(await rest(T, "auditoria?select=id")));
ok("técnico NÃO grava cobrança", (await rest(T, "registros", { method: "POST", body: JSON.stringify([{ tipo: "cobrancas", id: "tb1", cli: "c1", data: { id: "tb1" } }]) })).s >= 400);
r = await rest(T, "registros", { method: "POST", body: JSON.stringify([{ tipo: "clientes", id: "tc1", cli: "tc1", data: { id: "tc1", nome: "Cliente criado pelo técnico" } }]) });
ok("técnico cadastra cliente", r.s === 201);
ok("técnico NÃO exclui cliente", vazio(await rest(T, "registros?tipo=eq.clientes&id=eq.c1", { method: "DELETE" })));
ok("técnico NÃO exclui certificado", vazio(await rest(T, "registros?tipo=eq.certs&id=eq.k1", { method: "DELETE" })));
await rest(T, "registros", { method: "POST", body: JSON.stringify([{ tipo: "fotos", id: "tf1", cli: "c1", data: { id: "tf1", cli: "c1", path: "c1/t.png", nome: "t.png" } }]) });
r = await rest(T, "registros?tipo=eq.fotos&id=eq.tf1", { method: "DELETE" });
ok("técnico exclui foto", r.s === 200 && r.j.length === 1);
ok("técnico NÃO cria técnico nem admin", (await fn(T, { acao: "criar", nome: "x", email: "t1@y.com", senha: "12345678", papel: "tecnico" })).s === 403 && (await fn(T, { acao: "criar", nome: "x", email: "t2@y.com", senha: "12345678", papel: "admin" })).s === 403);
ok("técnico NÃO exclui usuário", (await fn(T, { acao: "excluir_usuario", id: "00000000-0000-0000-0000-000000000000" })).s === 403);
ok("técnico vê só o próprio perfil", (await rest(T, "perfis?select=id")).j.length === 1);
const meuId = (await rest(A, "perfis?select=id&papel=eq.admin")).j[0].id;
ok("técnico NÃO altera perfis", vazio(await rest(T, `perfis?id=eq.${meuId}`, { method: "PATCH", body: JSON.stringify({ papel: "tecnico" }) })));
ok("técnico envia foto", (await storage(T, "POST", "c1/teste-tecnico.png", PNG)) === 200);

grupo("Cliente (empresa Vale Verde)");
r = await rest(C, "registros?select=tipo,id,cli");
ok("cliente só enxerga a própria empresa", r.j.length > 0 && r.j.every((x) => x.cli === "c3"));
ok("cliente NÃO lê o registro de atividade", vazio(await rest(C, "auditoria?select=id")));
ok("cliente NÃO grava", (await rest(C, "registros", { method: "POST", body: JSON.stringify([{ tipo: "certs", id: "kx", cli: "c3", data: {} }]) })).s >= 400);
ok("cliente NÃO altera dados", vazio(await rest(C, "registros?tipo=eq.certs&id=eq.k5", { method: "PATCH", body: JSON.stringify({ data: { hack: 1 } }) })));
ok("cliente NÃO exclui", vazio(await rest(C, "registros?tipo=eq.certs&id=eq.k5", { method: "DELETE" })));
ok("cliente NÃO assina ordem de outra empresa", (await rest(C, "rpc/assinar_visita", { method: "POST", body: JSON.stringify({ p_id: "v2", p_nome: "Intruso", p_img: "data:image/png;base64,AAA" }) })).s >= 400);
ok("cliente NÃO cria usuário", (await fn(C, { acao: "criar", nome: "x", email: "c1@y.com", senha: "12345678", papel: "cliente", cliente_id: "c3" })).s === 403);
ok("cliente NÃO envia arquivo", (await storage(C, "POST", "c3/intruso.png", PNG)) >= 400);
ok("cliente NÃO abre arquivo de outra empresa", (await storage(C, "GET", "c1/posto-serra-verde-desratizacao.pdf")) >= 400);

grupo("Registro de atividade");
ok("administrador lê o registro", (await rest(A, "auditoria?select=id&limit=1")).j.length === 1);
ok("registro grava quem fez (técnico)", (await rest(A, "auditoria?select=id&usuario_nome=eq.T%C3%A9cnico%20Demo&limit=1")).j.length === 1);
ok("administrador NÃO escreve no registro", (await rest(A, "auditoria", { method: "POST", body: JSON.stringify({ usuario_nome: "x", acao: "x", tipo: "x", resumo: "forjado" }) })).s >= 400);
ok("administrador NÃO altera o registro", vazio(await rest(A, "auditoria?acao=eq.criou", { method: "PATCH", body: JSON.stringify({ resumo: "adulterado" }) })));
ok("administrador NÃO apaga o registro", vazio(await rest(A, "auditoria?id=gt.0", { method: "DELETE" })));

grupo("Eventos manuais (restauração de backup)");
ok("técnico NÃO registra evento", (await rest(T, "rpc/registrar_evento", { method: "POST", body: JSON.stringify({ p_acao: "x", p_resumo: "forjado" }) })).s >= 400);
ok("cliente NÃO registra evento", (await rest(C, "rpc/registrar_evento", { method: "POST", body: JSON.stringify({ p_acao: "x", p_resumo: "forjado" }) })).s >= 400);
ok("anônimo NÃO registra evento", (await rest(null, "rpc/registrar_evento", { method: "POST", body: JSON.stringify({ p_acao: "x", p_resumo: "forjado" }) })).s >= 400);
ok("administrador registra evento", (await rest(A, "rpc/registrar_evento", { method: "POST", body: JSON.stringify({ p_acao: "restaurou backup", p_resumo: "teste automático" }) })).s < 300);

grupo("Contas");
ok("não exclui a si mesmo nem o único administrador", (await fn(A, { acao: "excluir_usuario", id: meuId })).s === 400);
ok("senha curta é recusada", (await fn(A, { acao: "criar", nome: "x", email: "curta@y.com", senha: "123", papel: "tecnico" })).s === 400);
const tecId = (await rest(A, "perfis?select=id&papel=eq.tecnico")).j[0].id;
await rest(A, `perfis?id=eq.${tecId}`, { method: "PATCH", body: JSON.stringify({ ativo: false }) });
const tDes = await login("tecnico@agrocel.teste");
ok("usuário desativado perde o acesso aos dados", vazio(await rest(tDes, "registros?select=id")));
await rest(A, `perfis?id=eq.${tecId}`, { method: "PATCH", body: JSON.stringify({ ativo: true }) });
ok("usuário reativado volta a ver os dados", (await rest(await login("tecnico@agrocel.teste"), "registros?select=id&limit=1")).j.length === 1);

grupo("Código do repositório");
const achados = [];
const varre = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".claude"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { varre(p); continue; }
    if (!/\.(html|js|mjs|ts|sql|md|json|txt)$/.test(f.name)) continue;
    const txt = fs.readFileSync(p, "utf8");
    for (const m of txt.matchAll(/eyJ[\w-]+\.([\w-]+)\.[\w-]+/g)) {
      try { if (JSON.parse(Buffer.from(m[1], "base64url").toString()).role === "service_role") achados.push(p); } catch (_) {}
    }
    if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(txt)) achados.push(p);
  }
};
varre(raiz);
ok("nenhuma chave secreta (service_role) no código" + (achados.length ? ": " + achados.join(", ") : ""), achados.length === 0);

// limpeza do que o teste criou
await rest(A, "registros?tipo=eq.clientes&id=eq.tc1", { method: "DELETE" });
await fetch(`${URL_}/storage/v1/object/anexos`, { method: "DELETE", headers: { apikey: KEY, Authorization: "Bearer " + A, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: ["c1/teste-tecnico.png"] }) });

console.log(`\n${total - falhas} de ${total} testes passaram.` + (falhas ? ` ${falhas} FALHARAM: corrija antes de mexer no sistema real.` : " Tudo certo."));
process.exit(falhas ? 1 : 0);
