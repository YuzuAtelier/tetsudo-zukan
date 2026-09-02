/* 首都圏てつどうずかん — オフライン用の保存係（Service Worker）
 *
 * このファイルは tools/sw-template.js から build-app.mjs が生成する。
 * 直接 app/sw.js を編集しないこと（次のビルドで上書きされる）。
 *
 * 方針：
 *   まず保存済みを返して素早く開き、裏で新しいものを取りに行って次回に備える。
 *   （stale-while-revalidate）
 *   ビルドするたび CACHE 名が変わるので、データを直せば必ず新しいものに入れ替わる。
 */
var CACHE = "tetsudo-zukan-7224300811fc";
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      // 1つ取れなくても全体を巻き添えにしない
      .then(function (c) { return Promise.allSettled(ASSETS.map(function (u) { return c.add(u); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);   // 古い版を片づける
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;  // 外部は扱わない

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        var fresh = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () {
          // オフライン。ページを開こうとしたなら保存済みの本体を返す
          return hit || (req.mode === "navigate" ? cache.match("./index.html") : undefined);
        });
        return hit || fresh;
      });
    })
  );
});
