// ChatCity Service Worker — Firebase Messaging v4.0
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyAVKGyPWWQzEWfwkOwhwXabD3HbuLQz-qA",
  authDomain:        "chatcity-63c68.firebaseapp.com",
  databaseURL:       "https://chatcity-63c68-default-rtdb.firebaseio.com",
  projectId:         "chatcity-63c68",
  storageBucket:     "chatcity-63c68.firebasestorage.app",
  messagingSenderId: "1015529457316",
  appId:             "1:1015529457316:web:638f1d8e25539177844831"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  const data = payload.data || {};
  const notifType = data.type || 'message';

  let notifIcon = icon || 'https://cdn-icons-png.flaticon.com/512/3048/3048122.png';
  let sound = 'default';
  let vibrate = [200, 100, 200];

  // Customize for call notifications
  if(notifType === 'call') {
    vibrate = [500, 200, 500, 200, 500];
  }

  self.registration.showNotification(title || 'ChatCity 💬', {
    body:    body || 'New message',
    icon:    notifIcon,
    badge:   'https://cdn-icons-png.flaticon.com/512/3048/3048122.png',
    tag:     notifType === 'call' ? 'chatcity-call' : 'chatcity-msg',
    renotify: true,
    data:    { url: data.url || '/ChatCity/home.html', type: notifType },
    vibrate: vibrate,
    requireInteraction: notifType === 'call', // Keep call notifications visible
    actions: notifType === 'call' ? [
      { action: 'accept', title: '✅ Accept' },
      { action: 'decline', title: '❌ Decline' }
    ] : [
      { action: 'open', title: '💬 Open' }
    ]
  });
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || '/ChatCity/home.html';

  if(event.action === 'decline') {
    // Declined call — just close
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      // Find existing ChatCity tab
      for(const c of cs) {
        if(c.url.includes('ChatCity') || c.url.includes('chatcity')) {
          c.focus();
          c.navigate(url);
          return;
        }
      }
      // Open new window
      return clients.openWindow(url);
    })
  );
});

// Push event fallback (for browsers that don't trigger onBackgroundMessage)
self.addEventListener('push', event => {
  if(!event.data) return;
  try {
    const payload = event.data.json();
    const n = payload.notification || {};
    if(n.title) {
      event.waitUntil(
        self.registration.showNotification(n.title, {
          body: n.body || '',
          icon: n.icon || 'https://cdn-icons-png.flaticon.com/512/3048/3048122.png',
          badge: 'https://cdn-icons-png.flaticon.com/512/3048/3048122.png',
          data: payload.data || {}
        })
      );
    }
  } catch(e) {}
});
