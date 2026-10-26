// Physiospree Gym — Service Worker, handgeschrieben, KEINE Dependency.
//
// Ziele:
//  (a) Zuverlässiges Update ohne Neuinstallation: Navigationen (HTML) IMMER
//      network-first → online kommt stets die frische index.html, die auf die
//      aktuellen (gehashten) Bundles zeigt. Kein "alter Code" mehr.
//  (b) Offline-Öffnen: bei fehlendem Netz Fallback auf die gecachte App-Shell.
//      Passt zu Regel 9 (Offline-First) — die Laufzeitdaten liegen ohnehin im
//      localStorage, hier geht es nur darum, die App überhaupt zu starten.
//
// Prinzipien (bewusst streng, damit der SW nicht selbst zum Cache-Klotz wird):
//  1. CACHE_VERSION: bei 'activate' werden ALLE Caches != aktueller Version
//     gelöscht → sauberes Invalidieren.
//  2. Navigationen = network-first (nie index.html cache-first ausliefern).
//  3. Same-origin GET-Assets = stale-while-revalidate.
//  4. Nie abfangen/cachen: non-GET, cross-origin, /api/-Requests.
//     Cross-origin sind Google Fonts und Supabase, /api/ sind die Claude-
//     Routes — beides darf nie aus dem Cache kommen.
//  5. skipWaiting + clients.claim → neue Version aktiviert sofort.
//
// Beim Ändern dieser Datei CACHE_VERSION hochzählen.

const CACHE_VERSION = 'psg-v1';
const SHELL_URL = '/index.html';

self.addEventListener('install', () => {
  // Neue Version darf sofort aktiv werden, statt auf das Schließen aller Tabs
  // zu warten.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // (4) Nie abfangen: non-GET, cross-origin (Fonts, Supabase), /api/.
  if (
    req.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // (2) Navigationen (HTML) → network-first: online frisch, offline Cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const copy = fresh.clone();
          // Unter einem stabilen Schlüssel ablegen: die vercel.json schreibt
          // alle Nicht-/api/-Pfade auf / um, es ist also immer dieselbe Shell.
          event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.put(SHELL_URL, copy)));
          return fresh;
        } catch {
          const cached = await caches.match(SHELL_URL);
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // (3) Same-origin GET-Assets (gehashte JS/CSS, Icons, manifest) → SWR.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetching = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            // SOFORT klonen, nicht erst in der caches.open-Fortsetzung: bis die
            // läuft, hat der Client den Body schon gelesen und clone() wirft.
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.put(req, copy)));
          }
          return res;
        })
        // Netz weg und nichts im Cache: Response.error() statt undefined —
        // respondWith(undefined) würde werfen.
        .catch(() => cached ?? Response.error());
      return cached ?? fetching;
    })(),
  );
});
