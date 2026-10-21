// Popula (ou restaura) o AMBIENTE DE TESTE com dados fictícios.
// Uso:  node supabase/seed-teste.mjs <senha-dos-acessos-de-teste>
// Cria os três acessos de teste (admin, técnico, cliente) se ainda não existirem, apaga os registros do teste
// e grava de novo clientes, certificados, visitas, cobranças e documentos com datas relativas a hoje.
// Só mexe no projeto de TESTE. Nunca aponte este script para o projeto real.
import fs from "fs";
import zlib from "zlib";
import path from "path";
import { fileURLToPath } from "url";

const URL_ = "https://fnwtbezcalgnihuckolc.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZud3RiZXpjYWxnbmlodWNrb2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MTc4MTgsImV4cCI6MjEwODE5MzgxOH0.bS4YdG_L6dc_DDkED-LsQv6-OIE2eqHOmVDn-K4Fmgs";
const senha = process.argv[2];
if (!senha || senha.length < 8) { console.error("Informe a senha (mínimo 8 caracteres): node supabase/seed-teste.mjs <senha>"); process.exit(1); }
const aqui = path.dirname(fileURLToPath(import.meta.url));

const ACESSOS = {
  admin:   { nome: "Admin Demo",   email: "admin@agrocel.teste" },
  tecnico: { nome: "Técnico Demo", email: "tecnico@agrocel.teste" },
  cliente: { nome: "Carla Mendes", email: "cliente@agrocel.teste", empresa: "c3" },
};

const fn = async (body, tok) => {
  const r = await fetch(URL_ + "/functions/v1/usuarios", { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + (tok || KEY) }, body: JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const login = async (email) => {
  const r = await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY }, body: JSON.stringify({ email, password: senha }) });
  const j = await r.json(); return j.access_token;
};
const rest = (tok, p, opt = {}) => fetch(URL_ + "/rest/v1/" + p, { ...opt, headers: { apikey: KEY, Authorization: "Bearer " + tok, "Content-Type": "application/json", Prefer: "return=minimal", ...(opt.headers || {}) } });

// ---- datas relativas a hoje
const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const rel = (n) => { const x = new Date(hoje); x.setDate(x.getDate() + n); return iso(x); };

// ---- assinatura fictícia em PNG (curva desenhada pixel a pixel, sem dependências)
function assinaturaPNG() {
  const W = 440, H = 180, px = Buffer.alloc(W * H * 4);
  const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0], u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]; };
  const curvas = [[[30,120],[60,40],[90,40],[100,110]],[[100,110],[115,165],[145,160],[160,90]],[[160,90],[175,30],[205,30],[220,100]],[[220,100],[235,150],[265,145],[280,80]],[[280,80],[295,45],[320,125],[350,100]],[[350,100],[380,75],[405,70],[418,86]]];
  for (const c of curvas) for (let i = 0; i <= 400; i++) { const [x, y] = bez(...c, i / 400);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { if (dx*dx + dy*dy > 5) continue; const X = Math.round(x) + dx, Y = Math.round(y) + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const o = (Y * W + X) * 4; px[o] = 16; px[o+1] = 48; px[o+2] = 26; px[o+3] = 255; } }
  const raw = Buffer.alloc((W * 4 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4); }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return "data:image/png;base64," + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}
const SIG = assinaturaPNG();

// ---- dados fictícios
const PDF = { k1: "posto-serra-verde-desinsetizacao.pdf", k2: "posto-serra-verde-desratizacao.pdf", k3: "mercado-bom-preco-desinsetizacao.pdf", d1: "posto-serra-verde-execucao.pdf" };
const clientes = [
  { id: "c1", nome: "Posto Serra Verde Combustíveis Ltda", fantasia: "Posto Serra Verde", seg: "Posto de combustível", cnpj: "11.222.333/0001-81", cep: "88495-000", rua: "Rua das Palmeiras", num: "120", bairro: "Centro", cidade: "Garopaba", uf: "SC", resp: "Marcos Lima", tel: "(48) 99999-0001", email: "gerencia@postoserraverde.exemplo", obs: "Atender pela manhã." },
  { id: "c2", nome: "Mercado Bom Preço Ltda", fantasia: "Mercado Bom Preço", seg: "Mercado e padaria", cnpj: "22.333.444/0001-81", cep: "88760-000", rua: "Av. Central", num: "455", bairro: "Centro", cidade: "Rio Fortuna", uf: "SC", resp: "Joana Reis", tel: "(48) 99999-0002", email: "compras@bompreco.exemplo", obs: "" },
  { id: "c3", nome: "Laticínio Vale Verde", fantasia: "Vale Verde", seg: "Laticínio e frigorífico", cnpj: "33.444.555/0001-81", cep: "88750-000", rua: "Estrada Geral", num: "km 8", bairro: "Zona rural", cidade: "Braço do Norte", uf: "SC", resp: "Carla Mendes", tel: "(48) 99999-0003", email: "qualidade@valeverde.exemplo", obs: "Câmara fria: avisar a qualidade antes." },
  { id: "c4", nome: "Restaurante Sabor da Serra", fantasia: "Sabor da Serra", seg: "Restaurante e lanchonete", cnpj: "44.555.666/0001-81", cep: "88780-000", rua: "Rua XV de Novembro", num: "32", bairro: "Centro", cidade: "Imbituba", uf: "SC", resp: "Paulo Souza", tel: "(48) 99999-0004", email: "", obs: "" },
].map((c) => ({ ...c, im: "", comp: "", end: `${c.rua}, ${c.num}, ${c.bairro} · ${c.cidade}/${c.uf}` }));
const certs = [
  { id: "k1", cli: "c1", tipo: "Desinsetização", praga: "Moscas, aranhas, baratas e formigas", prod: "Lambda-cialotrina, Bifentrina, Tiametoxam", exec: rel(-184), venc: rel(181), pdf: "c1/" + PDF.k1 },
  { id: "k2", cli: "c1", tipo: "Desratização", praga: "Rato", prod: "Bromadiolona 0,005%", exec: rel(-184), venc: rel(-92), pdf: "c1/" + PDF.k2 },
  { id: "k3", cli: "c2", tipo: "Desinsetização", praga: "Baratas e formigas", prod: "Optigard Duo (Lambda-cialotrina + Tiametoxam)", exec: rel(-343), venc: rel(22), pdf: "c2/" + PDF.k3 },
  { id: "k4", cli: "c2", tipo: "Higienização de reservatório", praga: "Microbiológico", prod: "Hidróxido de sódio + Ácido peracético", exec: rel(-60), venc: rel(122) },
  { id: "k5", cli: "c3", tipo: "Desratização", praga: "Rato", prod: "Bromadiolona 0,005% (Maki Bloco)", exec: rel(-30), venc: rel(61), visita: "v1" },
  { id: "k6", cli: "c3", tipo: "Desinsetização", praga: "Moscas e baratas", prod: "Advion Barata Gel (Indoxacarbe)", exec: rel(-200), venc: rel(165) },
  { id: "k7", cli: "c4", tipo: "Desinsetização", praga: "Baratas", prod: "Quarteto 400 SC", exec: rel(-382), venc: rel(-17) },
  { id: "k8", cli: "c4", tipo: "Desratização", praga: "Rato", prod: "Bromadiolona 0,005%", exec: rel(-80), venc: rel(10), visita: "v2" },
];
const docs = [{ id: "d1", cli: "c1", nome: "Certificado de execução de serviço", data: rel(-184), pdf: "c1/" + PDF.d1 }];
const visitas = [
  { id: "v1", os: "OS-2026-0001", cli: "c3", tecnico: ACESSOS.tecnico.nome, data: rel(-30) + "T08:40", tipo: "Desratização", praga: "Rato", prod: "Bromadiolona 0,005% (Maki Bloco)", areas: "Câmara fria, expedição e perímetro", relatorio: "Encontrados vestígios na expedição. Iscas trocadas e perímetro reforçado.", status: "assinada", assinatura: { nome: "Carla Mendes", img: SIG, em: rel(-30) + "T09:15:00", cod: "7F3A91C2" } },
  { id: "v2", os: "OS-2026-0002", cli: "c4", tecnico: ACESSOS.tecnico.nome, data: rel(-80) + "T14:00", tipo: "Desratização", praga: "Rato", prod: "Bromadiolona 0,005%", areas: "Cozinha e depósito", relatorio: "", status: "pendente" },
];
const cobrancas = [
  { id: "b1", visita: "v1", cli: "c3", desc: "Desratização · OS-2026-0001", valor: 650, venc: rel(-20), forma: "Boleto + Pix", status: "paga", geradaEm: rel(-30) + "T09:20:00", pagoEm: rel(-22), nfse: { numero: "000041", emitidaEm: rel(-22) + "T10:05:00", aliquota: 3, cod: "A1B2-C3D4" } },
  { id: "b2", visita: "v2", cli: "c4", desc: "Desratização · OS-2026-0002", valor: 220, venc: rel(-70), forma: "Boleto", status: "aberta", geradaEm: rel(-80) + "T14:30:00" },
  { id: "b3", cli: "c2", desc: "Desinsetização · contrato mensal", valor: 480, venc: rel(8), forma: "Pix", status: "aberta", geradaEm: rel(-2) + "T08:00:00" },
  { id: "b4", cli: "c1", desc: "Desratização · renovação", valor: 350, venc: rel(15), forma: "Boleto + Pix", status: "aberta" },
  { id: "b5", cli: "c3", desc: "Manutenção mensal · perímetro", valor: 650, venc: rel(-1), forma: "Boleto + Pix", status: "paga", geradaEm: rel(-9) + "T09:00:00", pagoEm: rel(-3) },
];
const proprios = [
  { id: "p1", nome: "ART do responsável técnico (CREA-SC)", venc: rel(73) },
  { id: "p2", nome: "Alvará de Funcionamento", venc: rel(104) },
  { id: "p3", nome: "Alvará Sanitário", venc: rel(172) },
];

// ---- execução
let r = await fn({ acao: "bootstrap", ...ACESSOS.admin, senha });
console.log(r.s === 200 ? "Admin de teste criado." : "Admin de teste já existia.");
const A = await login(ACESSOS.admin.email);
if (!A) { console.error("Não foi possível entrar com o admin de teste (senha diferente da usada na criação?)."); process.exit(1); }

await rest(A, "registros?tipo=neq.__nenhum__", { method: "DELETE" });
const linhas = [
  ...clientes.map((o) => ["clientes", o.id, o.id, o]), ...certs.map((o) => ["certs", o.id, o.cli, o]), ...docs.map((o) => ["docs", o.id, o.cli, o]),
  ...visitas.map((o) => ["visitas", o.id, o.cli, o]), ...cobrancas.map((o) => ["cobrancas", o.id, o.cli, o]), ...proprios.map((o) => ["proprios", o.id, null, o]),
].map(([tipo, id, cli, data]) => ({ tipo, id, cli, data }));
const g = await rest(A, "registros", { method: "POST", body: JSON.stringify(linhas) });
console.log(g.ok ? `${linhas.length} registros gravados.` : "Erro ao gravar: " + (await g.text()));

for (const [cli, arq] of [["c1", PDF.k1], ["c1", PDF.k2], ["c1", PDF.d1], ["c2", PDF.k3]]) {
  const f = path.join(aqui, "..", "assets", "exemplos", arq);
  if (!fs.existsSync(f)) continue;
  const u = await fetch(`${URL_}/storage/v1/object/anexos/${cli}/${arq}`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + A, "Content-Type": "application/pdf", "x-upsert": "true" }, body: fs.readFileSync(f) });
  console.log(u.ok ? `PDF ${cli}/${arq} enviado.` : `PDF ${arq}: erro ${u.status}`);
}

for (const papel of ["tecnico", "cliente"]) {
  const a = ACESSOS[papel];
  const c = await fn({ acao: "criar", papel, nome: a.nome, email: a.email, senha, cliente_id: a.empresa || null }, A);
  console.log(`${papel}: ` + (c.s === 200 ? "criado." : (c.j.erro || c.s)));
}
console.log("\nPronto. Abra o app com ?teste no final do endereço.\nAcessos: admin@agrocel.teste, tecnico@agrocel.teste, cliente@agrocel.teste (mesma senha informada).");
