self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }
    await self.registration.showNotification(d.title || 'Космо Бонг', {
      body: d.body || 'Новое сообщение от клиента',
      icon: 'https://cosmo-bong.ru/design/logo-chat.png',
      badge: 'https://cosmo-bong.ru/design/logo-chat.png',
      data: { chatId: d.chatId || '' }
    });
    try {
      const list = await self.registration.getNotifications();
      if (self.navigator && self.navigator.setAppBadge) {
        await self.navigator.setAppBadge(list.length || 1);
      }
    } catch (e) {}
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (self.navigator && self.navigator.clearAppBadge) self.navigator.clearAppBadge().catch(() => {});
  const chatId = (event.notification.data && event.notification.data.chatId) || '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) {
          c.postMessage(chatId ? { type: 'open-chat', chatId: chatId } : { type: 'open-latest' });
          return c.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(chatId ? '/api/panel?chat=' + encodeURIComponent(chatId) : '/api/panel?openLatest=1');
      }
    })
  );
});
