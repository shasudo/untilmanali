// Pings (Web Push) state machine. Only ever buzzes from real taps.
import { useEffect, useState } from 'react'
import { api, urlBase64ToUint8Array } from '../api'
import { buzz } from '../feel'

export const pushOk =
  'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator
export const pushBlocked =
  'Notification' in window && Notification.permission === 'denied'

export function usePush(me: string, onErr: (msg: string) => void) {
  const [pushOn, setPushOn] = useState(() => localStorage.getItem('untilmanali.push') === '1')

  async function freshSub(): Promise<PushSubscription> {
    const keyJson = await api.pushKey().catch(() => null)
    if (!keyJson?.key) throw new Error('pings are not switched on, on this server yet')
    const reg = await navigator.serviceWorker.ready
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyJson.key) })
  }

  function friendlyPushErr(e: unknown): string {
    const msg = e instanceof Error ? e.message : 'pings failed to switch on'
    if (/push service/i.test(msg)) return 'ping service unreachable — check internet, pause any adblocker, tap again'
    if (/denied|not allowed|permission/i.test(msg)) return 'pings blocked — allow them in the browser settings, then tap again'
    if (/permission dismissed|dismiss/i.test(msg)) return 'you dismissed the ask — tap pings again to retry'
    return msg
  }

  async function togglePush() {
    try {
      if (!pushOk) { onErr('pings need a modern phone browser'); return }
      if (pushOn) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          try { await sub.unsubscribe() } catch { /* already gone */ }
          try { await api.unsub(sub.endpoint) } catch { /* server already forgot */ }
        }
        localStorage.removeItem('untilmanali.push')
        setPushOn(false)
        return
      }
      if (Notification.requestPermission && (await Notification.requestPermission()) !== 'granted') {
        onErr('pings blocked — allow them in the browser settings, then tap again')
        return
      }
      let sub: PushSubscription
      try {
        sub = await freshSub()
      } catch {
        // Stale browser-side subscription (e.g. made for older keys) — drop it, try once more.
        const reg = await navigator.serviceWorker.ready
        const old = await reg.pushManager.getSubscription().catch(() => null)
        if (old) {
          try { await old.unsubscribe() } catch { /* gone */ }
          try { await api.unsub(old.endpoint) } catch { /* gone */ }
        }
        sub = await freshSub()
      }
      await api.sub({ subscription: sub.toJSON(), crew: me })
      localStorage.setItem('untilmanali.push', '1')
      setPushOn(true)
      buzz('go')
    } catch (e) { buzz('nope'); onErr(friendlyPushErr(e)) }
  }

  // Keep the server's copy of this phone pointed at whoever is picked.
  useEffect(() => {
    if (!pushOn || !pushOk) return
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      if (sub) api.sub({ subscription: sub.toJSON(), crew: me }).catch(() => {})
    }).catch(() => {})
  }, [me, pushOn])

  return { pushOn, togglePush }
}
