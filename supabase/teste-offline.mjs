// Teste de ponta a ponta do modo sem internet, com a rede do navegador realmente cortada (Edge controlado pelo protocolo CDP).
// Antes: sirva a pasta do app em http://127.0.0.1:8765 (npx http-server -p 8765). Só usa o ambiente de TESTE.
// Uso:  AGROCEL_SENHA_TESTE=<senha> node supabase/teste-offline.mjs      (Windows com Microsoft Edge instalado)
// Restaura os dados de teste antes (node supabase/seed-teste.mjs) para as contagens baterem.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const URL_APP = "http://127.0.0.1:8765/index.html?teste";
const PORTA = 9333, perfil = fs.mkdtempSync(path.join(os.tmpdir(), "edge-cdp-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = []; let falhas = 0;
const ok = (n, c) => { if (!c) falhas++; R.push((c ? "OK     " : "FALHOU ") + n); };

const edge = spawn(EDGE, [`--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
let ws, seq = 0; const pend = new Map();
async function conectar() {
  for (let i = 0; i < 60; i++) {
    try {
      const alvos = await (await fetch(`http://127.0.0.1:${PORTA}/json`)).json();
      const pg = alvos.find((a) => a.type === "page");
      if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej }); break; }
    } catch (_) {}
    await sleep(500);
  }
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } };
}
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })) });
async function ev(expr) {
  const r = await cdp("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
  return r.result.result.value;
}
async function ir(url) { await cdp("Page.navigate", { url }); await sleep(3500); }
const rede = (off) => cdp("Network.emulateNetworkConditions", { offline: off, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

try {
  await conectar(); await cdp("Page.enable"); await cdp("Network.enable"); await cdp("Network.setCacheDisabled", { cacheDisabled: false });

  // 1) abre online, instala o service worker e entra como técnico
  await ir(URL_APP);
  const sw = await ev(`for(let i=0;i<40;i++){const r=await navigator.serviceWorker.getRegistration();if(r&&r.active){const ks=await caches.keys();const c=ks.length?await (await caches.open(ks[0])).keys():[];return {ativo:true,caches:ks,n:c.length}}await new Promise(r=>setTimeout(r,300))}return {ativo:false}`);
  ok(`service worker ativo e app guardado no aparelho (${JSON.stringify(sw)})`, sw.ativo && sw.n >= 6);
  await ev(`await sair();const {data,error}=await sb.auth.signInWithPassword({email:"tecnico@agrocel.teste",password:process_senha});if(error)throw error;await entrar(data.session);render();return 1`.replace("process_senha", JSON.stringify(process.env.AGROCEL_SENHA_TESTE)));
  const cache = await ev(`await new Promise(r=>setTimeout(r,800));return {perfil:await OFF.ler("perfil"),clientes:((await OFF.ler("clientes"))||[]).length}`);
  ok(`cópia mínima guardada no aparelho (perfil ${cache.perfil && cache.perfil.nome}, ${cache.clientes} clientes)`, cache.perfil && cache.perfil.papel === "tecnico" && cache.clientes >= 3);
  await ir(URL_APP);  // recarrega para o service worker controlar a página
  ok("página controlada pelo service worker", await ev(`return !!navigator.serviceWorker.controller`));
  const antes = await ev(`await carregar();return {v:db.visitas.length,f:db.fotos.length,k:db.certs.length}`);
  const arq0 = await ev(`const l=await sb.storage.from("anexos").list("c2");return l.data.length`);

  // 2) CORTA A INTERNET e recarrega a página
  await rede(true);
  await ir(URL_APP);
  const off = await ev(`await new Promise(r=>setTimeout(r,1500));return {ME:ME&&ME.nome,OFFLINE,tab,abas:[...document.querySelectorAll("#tabs button")].map(b=>b.textContent),faixa:!document.getElementById("offBar").hidden,clientes:db.clientes.length,form:!!document.getElementById("fVis")}`);
  ok(`página abre SEM internet em modo offline (${JSON.stringify(off)})`, off.OFFLINE === true && off.ME === "Técnico Demo" && off.form && off.clientes >= 3 && off.faixa);
  ok("só mostra Registrar visita e Pendentes offline", off.abas.length === 2 && off.abas[0] === "Registrar visita");

  // 3) preenche e conclui a visita offline, com 2 fotos (adicionadas em duas vezes) e assinatura
  const sub = await ev(`
    const $=id=>document.getElementById(id);
    const foto=async(cor,nome)=>{const cv=document.createElement("canvas");cv.width=900;cv.height=700;const x=cv.getContext("2d");x.fillStyle=cor;x.fillRect(0,0,900,700);const b=await new Promise(r=>cv.toBlob(r,"image/png"));return new File([b],nome,{type:"image/png"})};
    const add=async(...fs)=>{const dt=new DataTransfer();fs.forEach(f=>dt.items.add(f));$("vFotos").files=dt.files;$("vFotos").dispatchEvent(new Event("change"))};
    await add(await foto("#8bc34a","cozinha.png"));
    await add(await foto("#e8762c","deposito.png"));
    const cont1=$("vFotoCont").textContent;
    $("vFotoLista").querySelector("[data-fotorm='0']").click(); // remove a primeira
    await add(await foto("#004107","perimetro.png"));
    const cont2=$("vFotoCont").textContent;
    $("vCliente").value="c2";$("vPraga").value="Baratas";$("vProd").value="Produto Z";$("vAreas").value="Cozinha";$("vRel").value="Relatório feito offline no campo.";
    const cv=$("pad");const r=cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.left+30,clientY:r.top+40,pointerId:1,bubbles:true}));
    cv.dispatchEvent(new PointerEvent("pointermove",{clientX:r.left+120,clientY:r.top+70,pointerId:1,bubbles:true}));
    cv.dispatchEvent(new PointerEvent("pointerup",{pointerId:1,bubbles:true}));
    $("vNome").value="Joana Reis";
    $("fVis").requestSubmit();
    await new Promise(r=>setTimeout(r,3000));
    const it=(await OFF.listarSaida(ME.id));
    return {cont1,cont2,pend:it.length,fotos:it[0]&&it[0].fotos.map(f=>f.nome+":"+Math.round(f.blob.size/1024)+"KB"),assinada:it[0]&&it[0].v.status,os:it[0]&&it[0].v.os,tab,toast:document.getElementById("toast").textContent,aviso:!!document.querySelector("#tabs [data-tab=pendentes]")}`);
  ok(`fotos se acumulam (2) e remover funciona (2 → 2): "${sub.cont1}" / "${sub.cont2}"`, sub.cont1 === "2 fotos" && sub.cont2 === "2 fotos");
  ok(`visita ficou salva no aparelho com fotos e assinatura (${JSON.stringify(sub.fotos)}, ${sub.assinada})`, sub.pend === 1 && sub.fotos.length === 2 && sub.assinada === "assinada");
  ok("OS ainda sem número (definido ao enviar) e tela foi para Pendentes", sub.os === null && sub.tab === "pendentes");
  ok(`mensagem avisa que foi salva no celular: "${sub.toast}"`, /salva no celular/.test(sub.toast));

  // 4) recarrega SEM internet: a visita continua lá
  await ir(URL_APP);
  const rec = await ev(`await new Promise(r=>setTimeout(r,1200));return {pend:(await OFF.listarSaida(ME.id)).length,OFFLINE,abas:[...document.querySelectorAll("#tabs button")].map(b=>b.textContent)}`);
  ok(`depois de recarregar offline a visita continua guardada (${JSON.stringify(rec)})`, rec.pend === 1 && rec.OFFLINE && rec.abas.includes("Pendentes (1)"));

  // 5) tentar enviar offline não faz nada e não perde dados
  await ev(`await enviarPendentes(true);return 1`);
  ok("tentar enviar sem internet não apaga a visita", (await ev(`return (await OFF.listarSaida(ME.id)).length`)) === 1);

  // 6) LIGA A INTERNET: envio automático
  await rede(false);
  const env = await ev(`
    window.dispatchEvent(new Event("online"));
    for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,500));if((await OFF.listarSaida(ME.id)).length===0&&!OFFLINE&&!enviando)break}
    await carregar();
    const v=db.visitas.find(x=>x.relatorio&&x.relatorio.includes("offline no campo"));
    const fs=v?db.fotos.filter(f=>f.visita===v.id):[];
    const cert=v?db.certs.find(k=>k.visita===v.id):null;
    return {OFFLINE,pend:(await OFF.listarSaida(ME.id)).length,os:v&&v.os,status:v&&v.status,cli:v&&v.cli,tecnico:v&&v.tecnico,fotos:fs.length,cert:!!cert,quantas:db.visitas.filter(x=>x.relatorio&&x.relatorio.includes("offline no campo")).length,assin:v&&v.assinatura&&v.assinatura.nome}`);
  ok(`internet voltou: visita enviada sozinha (${JSON.stringify(env)})`, env.pend === 0 && env.os && /^OS-\d{4}-\d{4}$/.test(env.os) && env.status === "assinada" && env.cli === "c2" && env.fotos === 2 && env.cert && env.quantas === 1 && env.assin === "Joana Reis");
  ok("saiu do modo offline", env.OFFLINE === false);
  const dep = await ev(`return {v:db.visitas.length,f:db.fotos.length,k:db.certs.length}`);
  ok(`contagens no servidor: +1 visita, +2 fotos, +1 certificado (${JSON.stringify(antes)} → ${JSON.stringify(dep)})`, dep.v === antes.v + 1 && dep.f === antes.f + 2 && dep.k === antes.k + 1);
  const arq1 = await ev(`const l=await sb.storage.from("anexos").list("c2");return l.data.length`);
  ok(`arquivos novos no armazenamento: ${arq1 - arq0} (esperado 2)`, arq1 - arq0 === 2);

  // 7) falha no meio do envio (internet cai depois de subir as fotos): não duplica
  const meio = await ev(`
    const $=id=>document.getElementById(id);tab="visita";render();
    const foto=async(cor,nome)=>{const cv=document.createElement("canvas");cv.width=600;cv.height=400;const x=cv.getContext("2d");x.fillStyle=cor;x.fillRect(0,0,600,400);const b=await new Promise(r=>cv.toBlob(r,"image/png"));return new File([b],nome,{type:"image/png"})};
    const dt=new DataTransfer();dt.items.add(await foto("#123456","meio.png"));$("vFotos").files=dt.files;$("vFotos").dispatchEvent(new Event("change"));
    $("vCliente").value="c1";$("vRel").value="Visita com queda no meio do envio.";document.querySelector("[name=vModo][value=depois]").click();
    const orig=window.fetch;let derrubar=true;
    window.fetch=function(u,o){const url=String(u&&u.url||u);if(derrubar&&url.includes("/rest/v1/registros")&&o&&o.method==="POST")return Promise.reject(new TypeError("Failed to fetch"));return orig.apply(this,arguments)};
    $("fVis").requestSubmit();await new Promise(r=>setTimeout(r,4500));
    const it1=await OFF.listarSaida(ME.id);const estado1={pend:it1.length,foto_enviada:it1[0]&&!!it1[0].fotos[0].path,erro:!!(it1[0]&&it1[0].erro),tab};
    derrubar=false;window.fetch=orig;
    await enviarPendentes(true);await carregar();
    const vs=db.visitas.filter(x=>x.relatorio==="Visita com queda no meio do envio.");
    return {estado1,pend:(await OFF.listarSaida(ME.id)).length,visitas:vs.length,fotos:db.fotos.filter(f=>vs[0]&&f.visita===vs[0].id).length}`);
  ok(`queda no meio do envio: fica na fila com a foto já enviada (${JSON.stringify(meio.estado1)})`, meio.estado1.pend === 1 && meio.estado1.foto_enviada && meio.estado1.erro);
  ok(`ao reenviar não duplica (visitas ${meio.visitas}, fotos ${meio.fotos}, fila ${meio.pend})`, meio.pend === 0 && meio.visitas === 1 && meio.fotos === 1);

  // 8) sair guarda a fila; descartar apaga
  const sairT = await ev(`
    await OFF.salvarSaida({idLocal:"s-teste",userId:ME.id,criadoEm:Date.now(),v:{id:"vt",cli:"c1",data:"2026-10-22T10:00",tipo:"Desratização",status:"pendente"},fotos:[],tentativas:0});
    await recarregarSaida();await sair();
    const perfil=await OFF.ler("perfil");const cl=await OFF.ler("clientes");
    const todas=await OFF._op("saida","readonly",s=>s.getAll());
    return {perfil:perfil||null,clientes:cl||null,filaGuardada:todas.length}`);
  ok(`ao sair: cópia de perfil e clientes é apagada, fila continua (${JSON.stringify({perfil:sairT.perfil,clientes:sairT.clientes,fila:sairT.filaGuardada})})`, sairT.perfil === null && sairT.clientes === null && sairT.filaGuardada === 1);
  await ir(URL_APP);
  await rede(true); await ir(URL_APP);
  const semCache = await ev(`await new Promise(r=>setTimeout(r,1200));return {ME:ME&&ME.nome,login:!!document.getElementById("fLogin")}`);
  ok(`sem login e sem internet, o app NÃO abre modo offline (mostra o login): ${JSON.stringify(semCache)}`, semCache.ME === null && semCache.login);
  await rede(false);
} catch (e) { falhas++; R.push("ERRO NO TESTE: " + e.message); }
finally { console.log(R.join("\n")); console.log(`\n${falhas ? falhas + " FALHA(S)" : "Tudo certo"}`); try { ws.close() } catch (_) {} edge.kill(); await sleep(500); try { fs.rmSync(perfil, { recursive: true, force: true }) } catch (_) {} process.exit(falhas ? 1 : 0); }
