const CACHE_NAME = "easy-fuel-v4";
const OFFLINE_FALLBACK_PAGE = "/";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/badge-72.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          // Delete all old caches
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
          // For current cache, remove any API responses that might have been cached
          return caches.open(name).then((cache) => {
            return cache.keys().then((keys) => {
              return Promise.all(
                keys
                  .filter((request) => {
                    const url = new URL(request.url);
                    return url.pathname.startsWith("/api/");
                  })
                  .map((request) => cache.delete(request))
              );
            });
          });
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag,
    data: data.data,
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  let url = '/';

  if (data?.type === 'order_update' || data?.action === 'view_order') {
    url = `/orders/${data.orderId}`;
  } else if (data?.type === 'dispatch_offer' || data?.action === 'view_offers') {
    url = '/driver';
  } else if (data?.type === 'chat_message' || data?.action === 'view_chat') {
    url = `/orders/${data.orderId}`;
  }

  event.waitUntil(
    clients.openWindow(url)
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-HTTP(S) requests (chrome-extension, etc.)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // NEVER cache API requests - always fetch from network
  // This ensures state updates work correctly
  if (url.pathname.startsWith("/api/")) {
    // Same-origin session cookies must be sent; some environments omit credentials on cloned Request.
    event.respondWith(
      fetch(request.url, {
        method: request.method,
        headers: request.headers,
        credentials: "same-origin",
        cache: "no-store",
        redirect: request.redirect,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkNavigate(request));
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

function isStaticAsset(request, url) {
  const destination = request.destination;
  if (["style", "script", "worker", "font", "image"].includes(destination)) {
    return true;
  }

  const extension = url.pathname.split(".").pop();
  return ["js", "css", "png", "jpg", "jpeg", "svg", "webp", "woff", "woff2"].includes(
    extension || ""
  );
}

async function networkNavigate(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(OFFLINE_FALLBACK_PAGE)) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}
