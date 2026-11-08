// Rete prima, copia locale se offline: serve per installare l'app e aprirla senza campo.
// I dati (api.github.com) non passano di qui: sono di un'altra origine.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone();
    caches.open("sf").then((c) => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request)));
});
