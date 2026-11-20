// Sheet-back regression: opening a bottom sheet pushes a #dlg history entry,
// so the back button closes the sheet first instead of leaving the verse.
// Usage: launch Brave headless with remote debugging, then run:
//   brave --headless --remote-debugging-port=9333 --user-data-dir=/tmp/um-sheet &
//   node scripts/sheet-back.mjs            (live: https://manali.129-225-78-203.nip.io)
//   BASE_URL=http://127.0.0.1:8791 node scripts/sheet-back.mjs   (a throwaway copy)
// Read-only: opens a sheet and backs out without saving. Exits nonzero on fail.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = []
let id = 0
let ws
const pending = new Map()
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++id
    pending.set(i, { resolve, reject })
    ws.send(JSON.stringify({ id: i, method, params }))
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error('cdp timeout ' + method)) } }, 15000)
  })
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('page js failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 200))
  return r.result.value
}
async function clickFirst(selector, text) {
  return evalJs(`(() => { const els = [...document.querySelectorAll('${selector}')]; const el = ${text ? `els.find(b => (b.textContent || '').includes('${text}'))` : 'els[0]'}; if (!el) return 'missing'; el.click(); return 'clicked' })()`)
}
function check(name, cond, extra = '') {
  log.push(`${cond ? 'ok  ' : 'FAIL'}  ${name}${cond ? '' : ' :: ' + extra}`)
  if (!cond) process.exitCode = 1
}
const pages = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const page = pages.find((t) => t.type === 'page')
ws = new WebSocket(page.webSocketDebuggerUrl)
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data.toString())
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id) }
}
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: (process.env.BASE_URL || 'https://manali.129-225-78-203.nip.io') + '/fridge' })
await sleep(6000)
await clickFirst('.ss') // fresh-launch splash: tap to open
await sleep(800)
check('lands on fridge verse', await evalJs(`!!document.querySelector('.feed')`))
await clickFirst('.pop .cancel', 'later')
await sleep(300)
if (await evalJs(`!!document.querySelector('.gate')`)) {
  await clickFirst('.gate .who')
  await sleep(500)
}
await clickFirst('.fab-round')
await sleep(700)
check('sheet opens', await evalJs(`!!document.querySelector('.sheet')`))
const urlOpen = await evalJs(`window.location.href`)
check('dialog entry pushed', urlOpen.includes('#dlg'), urlOpen)
await evalJs(`window.history.back()`)
await sleep(700)
check('back closes sheet', await evalJs(`!document.querySelector('.sheet')`))
check('still on fridge verse', await evalJs(`!!document.querySelector('.feed')`))
const urlBack = await evalJs(`window.location.href`)
check('url back on verse, app open', !urlBack.includes('#dlg') && urlBack.includes('/fridge'), urlBack)
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
const { writeFileSync } = await import('node:fs')
writeFileSync('/tmp/sheet-final.png', Buffer.from(shot.data, 'base64'))
log.push('info  screenshot /tmp/sheet-final.png')
ws.close()
console.log(log.join('\n'))
