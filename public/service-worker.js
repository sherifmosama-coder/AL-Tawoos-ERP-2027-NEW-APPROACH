importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// Service Worker for Al-Tawoos ERP Background & Mobile Push Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push notification event listener (for Web Push / mobile notifications outside ERP)
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Al-Tawoos ERP | الطاووس',
    body: 'إشعار جديد أو إجراء مطلوب في النظام',
    url: '/'
  };

  if (event.data) {
    try {
      const raw = event.data.json();
      payload = {
        title: raw.notification?.title || raw.data?.title || raw.title || payload.title,
        body: raw.notification?.body || raw.data?.body || raw.body || payload.body,
        url: raw.data?.url || raw.fcmOptions?.link || raw.url || '/',
        tag: raw.notification?.tag || raw.data?.tag || raw.tag || 'tawoos-erp-notification'
      };
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.tag || 'tawoos-erp-notification',
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: payload.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// Direct client message listener (allows web page to dispatch mobile system notifications via SW)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    const resolvedOptions = {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      renotify: true,
      vibrate: [200, 100, 200],
      ...options
    };
    event.waitUntil(
      self.registration.showNotification(title || 'Al-Tawoos ERP', resolvedOptions)
    );
  }
});

// Click on notification opens/focuses the ERP window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
