import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAPEIS = ["admin", "tecnico", "cliente"];
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

type Ator = { id: string | null; nome: string; papel: string | null };
// Registro de atividade: guarda quem fez o quê, sem e-mails nem senhas.
async function registrar(ator: Ator, acao: string, resumo: string, cli: string | null = null) {
  await admin.from("auditoria").insert({
    usuario_id: ator.id, usuario_nome: ator.nome, papel: ator.papel, acao, tipo: "usuarios", cli, resumo,
  });
}

async function criarUsuario(nome: string, email: string, senha: string, papel: string, clienteId: string | null) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error || !data.user) {
    const m = error?.message ?? "Erro ao criar o usuário";
    return { erro: /already|registered|exists/i.test(m) ? "Já existe um usuário com este e-mail." : m };
  }
  const { error: e2 } = await admin.from("perfis").insert({
    id: data.user.id, nome, email, papel, cliente_id: papel === "cliente" ? clienteId : null,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { erro: e2.message };
  }
  return { ok: true, id: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resp({ erro: "Método não permitido" }, 405);

  let b: any;
  try { b = await req.json(); } catch { return resp({ erro: "Pedido inválido" }, 400); }
  const acao = String(b.acao ?? "");

  // Primeiro acesso: só funciona enquanto não existir nenhum administrador.
  if (acao === "bootstrap") {
    const { count } = await admin.from("perfis").select("id", { count: "exact", head: true }).eq("papel", "admin");
    if ((count ?? 0) > 0) return resp({ erro: "O sistema já tem um administrador." }, 403);
    const nome = String(b.nome ?? "").trim(), email = String(b.email ?? "").trim().toLowerCase(), senha = String(b.senha ?? "");
    if (!nome || !emailOk(email)) return resp({ erro: "Informe nome e e-mail válidos." }, 400);
    if (senha.length < 8) return resp({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    const r = await criarUsuario(nome, email, senha, "admin", null);
    if (r.ok) await registrar({ id: r.id!, nome, papel: "admin" }, "criou", "Primeiro administrador criado");
    return resp(r, r.erro ? 400 : 200);
  }

  // Demais ações exigem usuário logado.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return resp({ erro: "Sessão inválida. Entre novamente." }, 401);
  const { data: eu } = await admin.from("perfis").select("nome, papel, ativo").eq("id", u.user.id).maybeSingle();
  if (!eu || !eu.ativo || !["admin", "tecnico"].includes(eu.papel)) return resp({ erro: "Sem permissão." }, 403);
  const souAdmin = eu.papel === "admin";
  const ator: Ator = { id: u.user.id, nome: eu.nome, papel: eu.papel };

  if (acao === "criar") {
    const nome = String(b.nome ?? "").trim(), email = String(b.email ?? "").trim().toLowerCase(), senha = String(b.senha ?? "");
    const papel = String(b.papel ?? ""), clienteId = b.cliente_id ? String(b.cliente_id) : null;
    if (!PAPEIS.includes(papel)) return resp({ erro: "Perfil inválido." }, 400);
    if (!souAdmin && papel !== "cliente") return resp({ erro: "Só o administrador cadastra técnicos e administradores." }, 403);
    if (!nome || !emailOk(email)) return resp({ erro: "Informe nome e e-mail válidos." }, 400);
    if (senha.length < 8) return resp({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    if (papel === "cliente") {
      if (!clienteId) return resp({ erro: "Escolha a empresa do cliente." }, 400);
      const { data: c } = await admin.from("registros").select("id").eq("tipo", "clientes").eq("id", clienteId).maybeSingle();
      if (!c) return resp({ erro: "Empresa não encontrada." }, 400);
    }
    const r = await criarUsuario(nome, email, senha, papel, clienteId);
    if (r.ok) await registrar(ator, "criou", `Usuário ${nome} (${papel})`, clienteId);
    return resp(r, r.erro ? 400 : 200);
  }

  if (acao === "redefinir_senha") {
    const id = String(b.id ?? ""), senha = String(b.senha ?? "");
    if (senha.length < 8) return resp({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    const { data: alvo } = await admin.from("perfis").select("nome, papel, cliente_id").eq("id", id).maybeSingle();
    if (!alvo) return resp({ erro: "Usuário não encontrado." }, 404);
    if (!souAdmin && alvo.papel !== "cliente") return resp({ erro: "Sem permissão." }, 403);
    const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
    if (error) return resp({ erro: error.message }, 400);
    await registrar(ator, "redefiniu senha", `Usuário ${alvo.nome} (${alvo.papel})`, alvo.cliente_id);
    return resp({ ok: true });
  }

  if (acao === "excluir_usuario") {
    if (!souAdmin) return resp({ erro: "Só o administrador exclui usuários." }, 403);
    const id = String(b.id ?? "");
    if (id === u.user.id) return resp({ erro: "Você não pode excluir o próprio usuário." }, 400);
    const { data: alvo } = await admin.from("perfis").select("nome, papel, cliente_id").eq("id", id).maybeSingle();
    if (!alvo) return resp({ erro: "Usuário não encontrado." }, 404);
    if (alvo.papel === "admin") {
      const { count } = await admin.from("perfis").select("id", { count: "exact", head: true }).eq("papel", "admin").eq("ativo", true);
      if ((count ?? 0) <= 1) return resp({ erro: "Não dá para excluir o único administrador." }, 400);
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return resp({ erro: error.message }, 400);
    await registrar(ator, "excluiu", `Usuário ${alvo.nome} (${alvo.papel})`, alvo.cliente_id);
    return resp({ ok: true });
  }

  return resp({ erro: "Ação desconhecida" }, 400);
});
