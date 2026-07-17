// Daily Life Forge - Service Worker
// ・ネットワークが速いときは常に最新版を取得
// ・ネットワークが遅い（電波が悪い等）ときは一定時間で諦めてキャッシュを表示
// ・完全にオフラインのときもキャッシュを表示

const CACHE_NAME = 'daily-life-forge-v7'; // 大きく更新した際はこの番号を上げてください。index.htmlのAPP_VERSIONも同じ値にすること
const CACHE_URLS = [
  './',
  './index.html',
];
const NETWORK_TIMEOUT_MS = 3000; // これより取得に時間がかかったらキャッシュに切り替える

// インストール時：初回アクセス時に現在のページをキャッシュしておく
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CACHE_URLS).catch(() => {
        // 一部URLの取得に失敗しても致命的にしない
      });
    })
  );
});

// アクティベート時：古いバージョンのキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// フェッチ時：ネットワーク優先だが、一定時間で諦めてキャッシュにフォールバック
self.addEventListener('fetch', (event) => {
  // GET以外（POSTなど）はそのまま素通し
  if (event.request.method !== 'GET') return;
  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  const cache = await caches.open(CACHE_NAME);

  // ネットワーク取得（成功したらキャッシュも更新する）
  const networkPromise = fetch(request).then((response) => {
    cache.put(request, response.clone());
    return response;
  });
  // 「タイムアウトで見切りをつける」判定用に、失敗を握りつぶした別参照を用意
  const safeNetworkPromise = networkPromise.catch(() => null);

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve('TIMEOUT'), NETWORK_TIMEOUT_MS);
  });

  // ネットワーク取得とタイムアウト、早い方の結果を採用
  const raceResult = await Promise.race([safeNetworkPromise, timeoutPromise]);
  if (raceResult && raceResult !== 'TIMEOUT') {
    return raceResult; // 制限時間内にネットワークが成功した
  }

  // ここに来るのは「タイムアウトした」か「ネットワークが失敗した」場合
  // → キャッシュがあればすぐそれを返す（ネットワークはバックグラウンドで継続、間に合えば次回以降に反映される）
  const cached = await cache.match(request);
  if (cached) return cached;

  // キャッシュも無い場合（初回アクセスで電波が悪いケースなど）は、仕方なくネットワークの決着を待つ
  const finalNetwork = await safeNetworkPromise;
  if (finalNetwork) return finalNetwork;

  // トップページのキャッシュを最終手段として返す
  const fallback = await cache.match('./index.html');
  if (fallback) return fallback;

  // 本当に何も無ければ、簡単なメッセージを返す
  return new Response(
    'オフラインです。電波の良い場所で一度アクセスすると、以降はオフラインでも使えるようになります。',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}
