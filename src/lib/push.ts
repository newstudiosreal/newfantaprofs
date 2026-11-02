import { deletePushSubscription, savePushSubscription } from './api.social';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const toB64 = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))) : '');

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.ready;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!VAPID) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

/** Chiede il permesso, si iscrive al push e registra la subscription sul server. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) throw new Error('Il tuo browser non supporta le notifiche push.');
  if (!VAPID) throw new Error('Le notifiche push non sono ancora configurate su questo sito.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permesso negato: abilita le notifiche dalle impostazioni del browser.');
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) });
  await savePushSubscription(sub.endpoint, toB64(sub.getKey('p256dh')), toB64(sub.getKey('auth')));
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) {
    try { await deletePushSubscription(sub.endpoint); } catch { /* il server ripulirà da solo le subscription scadute */ }
    await sub.unsubscribe();
  }
  return 'off';
}
