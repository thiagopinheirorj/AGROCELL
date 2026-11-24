// Envia e-mail pelo Gmail da Agrocel (SMTP, senha de app). Usado pelos botões "Enviar por e-mail" do aplicativo.
// Segredos (Edge Functions > Secrets): GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_REMETENTE_NOME (opcional),
// EMAIL_RESPONDER_PARA (opcional), EMAIL_COPIA_RESPONSAVEL (opcional: e-mail que recebe cópia oculta).
// Para testes locais: SMTP_HOST, SMTP_PORT, SMTP_TLS=false.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
const cfg = () => ({
  user: Deno.env.get("GMAIL_USER") ?? "",
  pass: Deno.env.get("GMAIL_APP_PASSWORD") ?? "",
  host: Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com",
  port: Number(Deno.env.get("SMTP_PORT") ?? 465),
  tls: (Deno.env.get("SMTP_TLS") ?? "true") !== "false",
  nome: Deno.env.get("EMAIL_REMETENTE_NOME") ?? "Agrocel",
  responder: Deno.env.get("EMAIL_RESPONDER_PARA") ?? "",
  copia: Deno.env.get("EMAIL_COPIA_RESPONSAVEL") ?? "",
});

// O e-mail do destinatário vem SEMPRE do cadastro (cliente ou lead), nunca do pedido: assim o serviço não vira um enviador livre.
async function destinatario(tipo: string, ref: string): Promise<{ email: string; cli: string | null } | null> {
  const buscar = async (t: string, id: string) =>
    (await admin.from("registros").select("data, cli").eq("tipo", t).eq("id", id).maybeSingle()).data;
  if (tipo === "proposta") {
    const l = await buscar("leads", ref);
    return l ? { email: String(l.data?.email ?? "").trim(), cli: null } : null;
  }
  const origem = tipo === "os" ? await buscar("visitas", ref) : tipo === "cobranca" ? await buscar("cobrancas", ref) : null;
  if (!origem) return null;
  const c = await buscar("clientes", String(origem.cli ?? ""));
  return c ? { email: String(c.data?.email ?? "").trim(), cli: String(origem.cli) } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resp({ erro: "Método não permitido" }, 405);

  let b: any;
  try { b = await req.json(); } catch { return resp({ erro: "Pedido inválido" }, 400); }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return resp({ erro: "Sessão inválida. Entre novamente." }, 401);
  const { data: eu } = await admin.from("perfis").select("nome, papel, ativo").eq("id", u.user.id).maybeSingle();
  if (!eu || !eu.ativo || !["admin", "tecnico"].includes(eu.papel)) return resp({ erro: "Sem permissão." }, 403);

  const c = cfg();
  if (!c.user || !c.pass) return resp({ erro: "O envio por e-mail ainda não foi configurado.", naoConfigurado: true }, 503);

  const tipo = String(b.tipo ?? ""), ref = String(b.ref ?? "");
  if (!["os", "cobranca", "proposta"].includes(tipo) || !ref) return resp({ erro: "Pedido incompleto." }, 400);
  const assunto = String(b.assunto ?? "").trim().replace(/[\r\n]+/g, " ").slice(0, 200);
  const texto = String(b.texto ?? "").trim();
  if (!assunto || !texto) return resp({ erro: "Escreva o assunto e a mensagem." }, 400);
  if (texto.length > 8000) return resp({ erro: "A mensagem é longa demais." }, 400);

  const d = await destinatario(tipo, ref);
  if (!d) return resp({ erro: "Registro não encontrado." }, 404);
  if (!emailOk(d.email)) return resp({ erro: "Este cadastro não tem um e-mail válido. Preencha o e-mail e tente de novo.", semEmail: true }, 400);

  let anexo: { nome: string; base64: string } | undefined;
  if (b.anexo) {
    const base64 = String(b.anexo.base64 ?? "");
    const nome = String(b.anexo.nome ?? "documento.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    if (base64.length > 6_000_000) return resp({ erro: "O anexo é grande demais (limite de uns 4 MB)." }, 413);
    if (!base64.startsWith("JVBERi")) return resp({ erro: "O anexo precisa ser um PDF." }, 400);
    anexo = { nome: nome.toLowerCase().endsWith(".pdf") ? nome : nome + ".pdf", base64 };
  }

  // Limite por pessoa: 40 envios por hora (conta o registro de atividade).
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("auditoria").select("id", { count: "exact", head: true })
    .eq("usuario_id", u.user.id).eq("acao", "enviou e-mail").gte("em", desde);
  if ((count ?? 0) >= 40) return resp({ erro: "Muitos envios na última hora. Tente de novo mais tarde." }, 429);

  // Histórico: guarda cada tentativa (enviado ou falhou) com quem, quando, para quem, assunto e texto. O PDF não é guardado.
  const registrar = async (status: "enviado" | "falhou", erro: string | null) =>
    (await admin.from("emails_enviados").insert({
      usuario_id: u.user.id, usuario_nome: eu.nome, tipo, ref, cli: d.cli, para: d.email, assunto, texto,
      anexo: anexo?.nome ?? null, status, erro,
    }).select("id, em").maybeSingle()).data;

  const smtp = new SMTPClient({
    connection: { hostname: c.host, port: c.port, tls: c.tls, auth: c.pass && c.tls ? { username: c.user, password: c.pass } : undefined },
    // Conexão sem criptografia só é aceita em teste local (SMTP_TLS=false). Com o Gmail (porta 465) a conexão é sempre criptografada.
    debug: { allowUnsecure: !c.tls },
  });
  try {
    await smtp.send({
      from: `${c.nome} <${c.user}>`,
      to: d.email,
      ...(c.responder ? { replyTo: c.responder } : {}),
      ...(c.copia && emailOk(c.copia) ? { bcc: c.copia } : {}),
      subject: assunto,
      content: texto,
      ...(anexo ? { attachments: [{ filename: anexo.nome, content: anexo.base64, encoding: "base64", contentType: "application/pdf" }] } : {}),
    });
  } catch (e) {
    console.error("falha no envio:", String(e));
    await registrar("falhou", String(e).slice(0, 200));
    return resp({ erro: "Não foi possível enviar agora. Tente de novo em alguns minutos." }, 502);
  } finally {
    try { await smtp.close(); } catch (_) { /* ignora */ }
  }

  const reg = await registrar("enviado", null);
  // O registro de atividade nunca guarda e-mails: só o tipo do envio. O endereço fica só no histórico de e-mails.
  await admin.from("auditoria").insert({
    usuario_id: u.user.id, usuario_nome: eu.nome, papel: eu.papel, acao: "enviou e-mail", tipo: "email", cli: d.cli,
    resumo: `E-mail enviado (${tipo === "os" ? "ordem de serviço" : tipo === "cobranca" ? "cobrança" : "proposta"})`,
  });
  return resp({ ok: true, id: reg?.id ?? null, em: reg?.em ?? new Date().toISOString(), para: d.email });
});
