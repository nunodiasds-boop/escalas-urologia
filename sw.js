// Service worker da app das escalas: guarda a própria app (o «invólucro») para abrir sem rede e depressa.
// NUNCA guarda dados: os pedidos à Supabase (outro domínio) passam directos. A escala vista sem rede é a que a
// app guardou no próprio telemóvel (localStorage), não esta cache.
//  · navegação (abrir a app): rede primeiro; sem rede, a última página guardada.
//  · ficheiros da app (assets/ com o hash no nome, ícones, manifesto): cache primeiro; um ficheiro que falha
//    falha — nunca se responde com a página no lugar de um script (era o erro da v2, SW v80).
const CACHE = "escalas-v3-app-2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return;           // Supabase e afins: directo
  if (r.mode === "navigate") {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await fetch(r);
        if (res.ok) await c.put("./", res.clone());
        return res;
      } catch {
        return (await c.match("./")) ?? Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const guardado = await c.match(r);
    if (guardado) return guardado;
    const res = await fetch(r);                               // sem rede: falha (não se inventa resposta)
    if (res.ok && res.type === "basic") await c.put(r, res.clone());
    return res;
  })());
});

// ── avisos (Web Push): a Edge Function `enviar-avisos` manda {titulo, texto, ligacao, quantos} ──
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: "Escalas", texto: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.titulo || "Escalas", {
      body: d.texto || "", tag: "escalas-avisos", renotify: true, icon: "icones/icone-192.png", badge: "icones/icone-192.png",
      data: { ligacao: d.ligacao || "avisos" },
    });
    if (self.navigator && "setAppBadge" in self.navigator && d.quantos) { try { await self.navigator.setAppBadge(d.quantos); } catch { /* sem crachá */ } }
  })());
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL("./#/" + String(e.notification.data?.ligacao || "avisos").replace(/^\/+/, ""), self.registration.scope).href;
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const j of janelas) { if ("focus" in j) { await j.navigate(destino).catch(() => {}); return j.focus(); } }
    return self.clients.openWindow(destino);
  })());
});
