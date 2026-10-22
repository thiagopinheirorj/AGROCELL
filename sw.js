// Service worker do Agrocel Certificados: guarda o app no aparelho para abrir sem internet.
// Só mexe em arquivos do próprio site. Supabase (login, dados, fotos) sempre vai pela rede.
// Ao mudar qualquer arquivo de assets/vendor, aumente VERSAO para o aparelho baixar de novo.
const VERSAO = "agrocel-v1";
const BASE = ["./", "index.html", "assets/logo-agrocel.png", "assets/vendor/supabase.js", "assets/vendor/jspdf.umd.min.js", "assets/vendor/xlsx.full.min.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Página: tenta a rede (para receber atualizações) e, sem internet, usa a cópia guardada.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) { const cp = r.clone(); caches.open(VERSAO).then((c) => c.put("index.html", cp)); }
          return r;
        })
        .catch(() => caches.match("index.html"))
    );
    return;
  }

  // Demais arquivos do site: usa o guardado e, se faltar, busca e guarda.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const cp = r.clone(); caches.open(VERSAO).then((c) => c.put(req, cp)); }
      return r;
    }))
  );
});
