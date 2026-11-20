// Custom service worker (injectManifest): offline shell + API cache + pings.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { clientsClaim } from 'workbox-core'

type WBEntry = { url: string; revision: string | null }
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: WBEntry[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener(type: string, listener: (event: any) => void): void
  registration: { showNotification(title: string, opts: Record<string, unknown>): Promise<void> }
  clients: { openWindow(url: string): Promise<object | null> }
  skipWaiting(): Promise<void>
}
const sw = self

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()
sw.skipWaiting()

registerRoute(
  ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName: 'api', networkTimeoutSeconds: 3 })
)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

sw.addEventListener('push', (event: {
  data: { json(): { title?: string; body?: string; url?: string } } | null
  waitUntil(p: Promise<unknown>): void
}) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    sw.registration.showNotification(data.title || 'UntilManali', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  )
})

sw.addEventListener('notificationclick', (event: {
  notification: { close(): void; data?: { url?: string } }
  waitUntil(p: Promise<unknown>): void
}) => {
  event.notification.close()
  event.waitUntil(sw.clients.openWindow(event.notification.data?.url || '/'))
})
