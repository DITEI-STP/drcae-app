import * as api from './api';

export async function registerAppPush(vapidPublicKey?: string | null) {
  if (!isPushSupported() || !isUsableVapidKey(vapidPublicKey)) return;

  try {
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
      });
    }

    await api.savePushSubscription(subscription.toJSON());
  } catch (err) {
    console.warn('[drcae] Web Push indisponível:', err);
  }
}

function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function isUsableVapidKey(value?: string | null) {
  return !!value && value.length > 40 && !value.toLowerCase().startsWith('changeme');
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
