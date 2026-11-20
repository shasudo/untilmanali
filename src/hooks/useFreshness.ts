// Aggressive freshness for 6 people: a genuinely newer build reloads once
// onto it; otherwise just re-pull the data — an open tab must never go stale.
// First sighting in a tab never reloads (a reload there would kill the splash).
import { useEffect, useRef } from 'react'

export function useFreshness(load: () => Promise<void>) {
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    let dead = false
    let timer: ReturnType<typeof setInterval> | undefined
    const check = async (refreshData = true) => {
      try {
        const h = await (await fetch('/api/v1/health', { cache: 'no-store' })).json() as { build?: string }
        if (dead || !h.build) return
        const seen = sessionStorage.getItem('um-fresh')
        if (seen && seen !== h.build) {
          sessionStorage.setItem('um-fresh', h.build)
          try { await navigator.serviceWorker?.getRegistration?.().then((r) => r?.update()) } catch { /* old worker stays */ }
          location.reload()
          return
        }
        if (!seen) sessionStorage.setItem('um-fresh', h.build)
        if (refreshData && !dead) await loadRef.current()
      } catch { /* offline — keep the old copy */ }
    }
    check(false)
    timer = setInterval(() => check(true), 60000)
    const onVis = () => { if (document.visibilityState === 'visible') check(true) }
    const onFocus = () => check(true)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    return () => { dead = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onFocus) }
  }, [])
}
