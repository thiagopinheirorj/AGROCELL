// Avisos automáticos de vencimento: 30 e 15 dias antes. Roda todo dia (pg_cron chama esta função com o cabeçalho x-cron-secret).
// Cada certificado gera no máximo um aviso de 30 e um de 15 dias, ao cliente (se tiver e-mail). O responsável recebe um resumo do dia.
// Segredos: CRON_SECRET, GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_RESPONSAVEL, EMAIL_REMETENTE_NOME (opcional), EMAIL_RESPONDER_PARA (opcional).
// Esta função deve ser publicada com verify_jwt desligado (o agendador não tem login); a proteção é o x-cron-secret.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
  responsavel: Deno.env.get("EMAIL_RESPONSAVEL") ?? "",
});
const MAX_POR_EXECUCAO = 80; // o Gmail limita os envios diários; o resto vai no dia seguinte

const iguais = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};
const hojeSP = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (s: string) => s.split("-").reverse().join("/");
const diasAte = (venc: string, hoje: string) => Math.round((Date.parse(venc + "T00:00:00Z") - Date.parse(hoje + "T00:00:00Z")) / 86400000);

async function todos(tipo: string) {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin.from("registros").select("id, cli, data").eq("tipo", tipo).order("id").range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resp({ erro: "Método não permitido" }, 405);
  const segredo = Deno.env.get("CRON_SECRET") ?? "";
  if (!segredo || !iguais(req.headers.get("x-cron-secret") ?? "", segredo)) return resp({ erro: "Não autorizado." }, 401);
  let b: any = {}; try { b = await req.json(); } catch { /* corpo vazio */ }
  const simular = b.simular === true;

  const c = cfg();
  if (!simular && (!c.user || !c.pass)) return resp({ erro: "O envio por e-mail ainda não foi configurado.", naoConfigurado: true }, 503);

  const hoje = iso(hojeSP());
  const [certs, clientes, enviados] = await Promise.all([
    todos("certs"), todos("clientes"),
    admin.from("avisos_enviados").select("cert_id, marco").then((r) => r.data ?? []),
  ]);
  const cli = new Map(clientes.map((x) => [String(x.id), x.data]));
  const jaFoi = new Set(enviados.map((e: any) => `${e.cert_id}:${e.marco}`));

  // Pendentes de aviso: marco 30 (de 16 a 30 dias) e marco 15 (de 0 a 15 dias). Pula o que já foi renovado.
  type Item = { cert: any; marco: 15 | 30; dias: number };
  const pendentes: Item[] = [];
  for (const k of certs) {
    const venc = String(k.data?.venc ?? ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) continue;
    const dias = diasAte(venc, hoje); if (dias < 0 || dias > 30) continue;
    const renovado = certs.some((o) => o.id !== k.id && o.cli === k.cli && o.data?.tipo === k.data?.tipo && String(o.data?.venc ?? "") > venc);
    if (renovado) continue;
    const marco: 15 | 30 = dias <= 15 ? 15 : 30;
    if (jaFoi.has(`${k.id}:${marco}`)) continue;
    pendentes.push({ cert: k, marco, dias });
  }
  pendentes.sort((a, b) => a.dias - b.dias);
  const lote = pendentes.slice(0, MAX_POR_EXECUCAO);

  if (simular) {
    return resp({ simulacao: true, hoje, total: pendentes.length, itens: lote.map((i) => ({ cert: i.cert.id, marco: i.marco, dias: i.dias, temEmail: emailOk(String(cli.get(String(i.cert.cli))?.email ?? "")) })) });
  }

  const smtp = new SMTPClient({ connection: { hostname: c.host, port: c.port, tls: c.tls, auth: c.pass && c.tls ? { username: c.user, password: c.pass } : undefined }, debug: { allowUnsecure: !c.tls } });
  const resumo: string[] = []; let enviadosN = 0, semEmail = 0, falhas = 0;
  try {
    for (const it of lote) {
      const cl = cli.get(String(it.cert.cli)) ?? {};
      const nome = String(cl.fantasia || cl.nome || "cliente");
      const tipo = String(it.cert.data?.tipo ?? "serviço"), venc = String(it.cert.data.venc);
      const email = String(cl.email ?? "").trim();
      const quando = it.dias === 0 ? "vence hoje" : `vence em ${it.dias} dia${it.dias === 1 ? "" : "s"}`;
      if (!emailOk(email)) {
        semEmail++; resumo.push(`• ${nome} · ${tipo} · ${quando} (${fmt(venc)}) · SEM E-MAIL CADASTRADO`);
        await admin.from("avisos_enviados").upsert({ cert_id: it.cert.id, marco: it.marco, para_cliente: false });
        continue;
      }
      try {
        await smtp.send({
          from: `${c.nome} <${c.user}>`, to: email, ...(c.responder ? { replyTo: c.responder } : {}),
          subject: `Aviso: o certificado de ${tipo.toLowerCase()} ${quando}`,
          content: `Olá!\n\nO certificado de ${tipo.toLowerCase()} da ${nome} ${quando}, em ${fmt(venc)}.\n\nPara manter a validade e evitar problemas com a fiscalização, vale agendar a próxima aplicação antes dessa data. É só responder este e-mail ou chamar a ${c.nome}.\n\nAtenciosamente,\n${c.nome}\n\n—\nVocê recebe este aviso porque a ${nome} é cliente da ${c.nome}. Se não quiser mais receber, responda este e-mail.`,
        });
        enviadosN++; resumo.push(`• ${nome} · ${tipo} · ${quando} (${fmt(venc)}) · aviso enviado ao cliente`);
        await admin.from("avisos_enviados").upsert({ cert_id: it.cert.id, marco: it.marco, para_cliente: true });
      } catch (e) {
        falhas++; console.error("falha no aviso:", it.cert.id, String(e));
      }
    }
    if (resumo.length && c.responsavel && emailOk(c.responsavel)) try {
      await smtp.send({
        from: `${c.nome} <${c.user}>`, to: c.responsavel,
        subject: `Avisos de vencimento de hoje (${fmt(hoje)})`,
        content: `Resumo dos avisos de vencimento de hoje:\n\n${resumo.join("\n")}\n\nClientes marcados como SEM E-MAIL precisam de contato por telefone ou WhatsApp, e o e-mail deve ser cadastrado na ficha do cliente.`,
      });
    } catch (e) { falhas++; console.error("falha no resumo ao responsável:", String(e)); }
  } finally {
    try { await smtp.close(); } catch (_) { /* ignora */ }
  }

  if (enviadosN || semEmail) {
    await admin.from("auditoria").insert({ usuario_nome: "Sistema", acao: "enviou avisos", tipo: "email", resumo: `Avisos de vencimento: ${enviadosN} enviado(s), ${semEmail} sem e-mail, ${falhas} falha(s)` });
  }
  return resp({ ok: true, hoje, enviados: enviadosN, semEmail, falhas, restantes: Math.max(0, pendentes.length - lote.length) });
});
