import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname } from 'node:path'
import { setVapidDetails, sendNotification } from 'web-push'

const PORT = Number(process.env.PORT || 8787)
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version

// --- Push (Web Push/VAPID). Absent keys = pings off, everything else works.
let PUSH_ON = false
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:untilmanali@localhost',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
  PUSH_ON = true
}

async function notifyExcept(actor, { title, body }) {
  if (!PUSH_ON) return
  const subs = db.prepare('SELECT endpoint, keys, crew FROM subscriptions').all()
  const payload = JSON.stringify({ title, body, url: '/' })
  await Promise.all(subs.filter((s) => s.crew !== actor).map(async (s) => {
    try {
      await sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, payload)
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        db.prepare('DELETE FROM subscriptions WHERE endpoint = ?').run(s.endpoint)
      }
    }
  }))
}
const firstName = (id) => ({ shathwik: 'Shathwik', koushik: 'Koushik', deepika: 'Deepika', srinivas: 'Srinivas', rushi: 'Rushi', sonika: 'Sonika' }[id] || id)

// --- Daily digest: one automatic nudge, only if something is pending.
// Clearly from the app, never from a person. Time is UTC "HH:MM".
const DIGEST_AT_UTC = process.env.DIGEST_AT_UTC || '15:30'
function msUntilDigest() {
  const [hh, mm] = DIGEST_AT_UTC.split(':').map(Number)
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh || 0, mm || 0))
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return next.getTime() - now.getTime()
}
async function sendDigest() {
  try {
    const { debts } = balances()
    const subs = PUSH_ON ? db.prepare('SELECT endpoint, keys FROM subscriptions').all() : []
    if (debts.length && subs.length) {
      const shown = debts.slice(0, 2).map((d) => `${firstName(d.from)} owes ${firstName(d.to)} ₹${Math.round(d.amount)}`).join(' · ')
      const more = debts.length > 2 ? ` · +${debts.length - 2} more` : ''
      const payload = JSON.stringify({ title: `automatic nudge · ${debts.length} to sort`, body: `${shown}${more} — nobody poked you, the app did`, url: '/' })
      await Promise.all(subs.map(async (s) => {
        try { await sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, payload) }
        catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) db.prepare('DELETE FROM subscriptions WHERE endpoint = ?').run(s.endpoint) }
      }))
    }
  } catch { /* digest never breaks the app */ }
  scheduleDigest()
}
function scheduleDigest() { setTimeout(() => { sendDigest().catch(() => scheduleDigest()) }, msUntilDigest()) }
const CREW = ['shathwik', 'koushik', 'deepika', 'srinivas', 'rushi', 'sonika']

mkdirSync('data', { recursive: true })
const db = new DatabaseSync(join('data', 'crew.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_by TEXT NOT NULL,
    split TEXT NOT NULL DEFAULT 'equal',
    shares TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS upi_handles (
    crew TEXT PRIMARY KEY,
    vpa TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    endpoint TEXT PRIMARY KEY,
    keys TEXT NOT NULL,
    crew TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#d8ff3e',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)
try { db.exec(`ALTER TABLE expenses ADD COLUMN involved TEXT NOT NULL DEFAULT '["shathwik","koushik","deepika","srinivas","rushi","sonika"]'`) } catch { /* already migrated */ }
try { db.exec(`ALTER TABLE memories ADD COLUMN done INTEGER NOT NULL DEFAULT 0`) } catch { /* already migrated */ }

const ALLC = ['shathwik', 'koushik', 'deepika', 'srinivas', 'rushi', 'sonika']
const ALLC_JSON = JSON.stringify(ALLC)

function involvedList(e) {
  try {
    const v = JSON.parse(e.involved || ALLC_JSON)
    const ok = v.filter((id) => ALLC.includes(id))
    return ok.length ? ok : [...ALLC]
  } catch { return [...ALLC] }
}

// Per-person share of one expense row. Handles equal/custom/percent + penny fix.
function decPlaces(n) {
  const s = String(n).split('.')
  return s.length < 2 ? 0 : s[1].length
}

// True when the penny fix actually moved a paise: uneven equal splits
// or percent shares that don't land on whole paise. Custom is exact by construction.
function wasRounded(e) {
  const inv = involvedList(e)
  if (e.split === 'custom') return false
  if (e.split === 'equal') return decPlaces(e.amount / inv.length) > 2
  const s = JSON.parse(e.shares || '{}')
  return inv.some((id) => decPlaces(e.amount * Number(s[id] || 0) / 100) > 2)
}

function breakdown(e) {
  const inv = involvedList(e)
  const out = {}
  if (e.split === 'custom') {
    const s = JSON.parse(e.shares || '{}')
    for (const id of inv) out[id] = Math.round(Number(s[id] || 0) * 100) / 100
  } else if (e.split === 'percent') {
    const s = JSON.parse(e.shares || '{}')
    let acc = 0
    inv.forEach((id, i) => {
      if (i === inv.length - 1) out[id] = Math.round((e.amount - acc) * 100) / 100
      else { out[id] = Math.round((e.amount * Number(s[id] || 0) / 100) * 100) / 100; acc += out[id] }
    })
  } else {
    let acc = 0
    inv.forEach((id, i) => {
      if (i === inv.length - 1) out[id] = Math.round((e.amount - acc) * 100) / 100
      else { out[id] = Math.round((e.amount / inv.length) * 100) / 100; acc += out[id] }
    })
  }
  return out
}

const app = new Hono()

// Open crew app: no auth. Anyone who can reach the address is in.
// --- Module: expenses (extract to modules/expenses/routes.ts when adding module 2) ---
app.get('/api/v1/expenses', (c) => {
  const { rem, torn } = allocate()
  const rows = db.prepare('SELECT * FROM expenses ORDER BY id DESC LIMIT 300').all()
  return c.json({
    expenses: rows.filter((r) => !torn.has(r.id)).map((r) => ({
      id: r.id, title: r.title, amount: r.amount, paidBy: r.paid_by,
      split: r.split, shares: JSON.parse(r.shares || '{}'),
      involved: involvedList(r), breakdown: breakdown(r), remaining: rem.get(r.id),
      rounded: wasRounded(r), createdAt: r.created_at + 'Z',
    })),
  })
})

app.post('/api/v1/expenses', async (c) => {
  const b = await c.req.json()
  const title = String(b.title || '').trim().slice(0, 60)
  const amount = Math.round(Number(b.amount) * 100) / 100
  const paidBy = String(b.paidBy || '')
  const split = b.split === 'custom' ? 'custom' : b.split === 'percent' ? 'percent' : 'equal'
  const involved = Array.isArray(b.involved) ? [...new Set(b.involved)].filter((id) => CREW.includes(id)) : [...CREW]
  if (!title || !(amount > 0) || !CREW.includes(paidBy) || !involved.length) return c.text('bad expense', 400)
  let shares = {}
  if (split === 'custom') {
    const vals = Object.entries(b.shares || {}).filter(([k, v]) => involved.includes(k) && Number(v) >= 0)
    const sum = vals.reduce((s, [, v]) => s + Number(v), 0)
    if (Math.abs(sum - amount) > 0.01) return c.text('shares must add to amount', 400)
    shares = Object.fromEntries(vals.map(([k, v]) => [k, Math.round(Number(v) * 100) / 100]))
  } else if (split === 'percent') {
    const vals = Object.entries(b.shares || {}).filter(([k, v]) => involved.includes(k) && Number(v) >= 0)
    const sum = vals.reduce((s, [, v]) => s + Number(v), 0)
    if (Math.abs(sum - 100) > 0.01) return c.text('percents must add to 100', 400)
    shares = Object.fromEntries(vals.map(([k, v]) => [k, Math.round(Number(v) * 100) / 100]))
  }
  const r = db.prepare(
    "INSERT INTO expenses (title, amount, paid_by, split, shares, involved) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
  ).get(title, amount, paidBy, split, JSON.stringify(shares), JSON.stringify(involved))
  notifyExcept(paidBy, { title: `${firstName(paidBy)} stuck ${title} · ₹${amount}`, body: 'tap to see the fridge' }).catch(() => {})
  return c.json({ id: r.id })
})

app.get('/api/v1/expenses/:id/related', (c) => {
  const id = Number(c.req.param('id'))
  const { settles, takes } = allocate()
  const rows = settles.filter((s) => ((takes.get(s.id) || {})[id] || 0) > 0.005)
  return c.json({ settlements: rows.map((r) => ({ id: r.id, from: r.from_id, to: r.to_id, amount: r.amount, createdAt: r.created_at + 'Z' })) })
})

app.delete('/api/v1/expenses/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id)
  const url = new URL(c.req.url)
  if (row && url.searchParams.get('withSettlements') === '1') {
    const { settles, takes } = allocate()
    for (const s of settles) {
      if (((takes.get(s.id) || {})[id] || 0) > 0.005) db.prepare('DELETE FROM settlements WHERE id = ?').run(s.id)
    }
  }
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
  if (row) notifyExcept('', { title: `torn off: ${row.title} · ₹${row.amount}`, body: 'tap to see the fridge' }).catch(() => {})
  return c.json({ ok: true })
})

function balances() {
  const expenses = db.prepare('SELECT * FROM expenses').all()
  const settlements = db.prepare('SELECT * FROM settlements').all()
  const totals = Object.fromEntries(CREW.map((id) => [id, 0]))
  const owed = Object.fromEntries(CREW.map((id) => [id, 0]))
  for (const e of expenses) {
    totals[e.paid_by] = Math.round((totals[e.paid_by] + e.amount) * 100) / 100
    const parts = breakdown(e)
    for (const id of CREW) owed[id] = Math.round((owed[id] + (parts[id] || 0)) * 100) / 100
  }
  const net = Object.fromEntries(CREW.map((id) => [id, Math.round((totals[id] - owed[id]) * 100) / 100]))
  // settlements move net: receiver net decreases, payer net increases
  for (const s of settlements) {
    net[s.from_id] = Math.round((net[s.from_id] + s.amount) * 100) / 100
    net[s.to_id] = Math.round((net[s.to_id] - s.amount) * 100) / 100
  }
  // greedy settle: debtors pay creditors
  const debtors = CREW.filter((id) => net[id] < -0.005).map((id) => ({ id, amt: -net[id] })).sort((a, b) => b.amt - a.amt)
  const creditors = CREW.filter((id) => net[id] > 0.005).map((id) => ({ id, amt: net[id] })).sort((a, b) => b.amt - a.amt)
  const debts = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt)
    debts.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(pay * 100) / 100 })
    debtors[i].amt -= pay; creditors[j].amt -= pay
    if (debtors[i].amt < 0.005) i++
    if (creditors[j].amt < 0.005) j++
  }
  return { totals, net, debts }
}

app.get('/api/v1/balances', (c) => c.json(balances()))

app.post('/api/v1/settle', async (c) => {
  const b = await c.req.json()
  const { from, to, amount } = b
  if (!CREW.includes(from) || !CREW.includes(to) || from === to || !(Number(amount) > 0)) {
    return c.text('bad settlement', 400)
  }
  const ins = db.prepare('INSERT INTO settlements (from_id, to_id, amount) VALUES (?, ?, ?) RETURNING id').get(from, to, Math.round(Number(amount) * 100) / 100)
  notifyExcept(from, { title: `${firstName(from)} sorted ₹${amount} to ${firstName(to)}`, body: 'debts updated — tap to see' }).catch(() => {})
  const { torn, takes, expenses } = allocate()
  const myTakes = takes.get(ins.id) || {}
  const cleared = expenses.filter((e) => torn.has(e.id) && (myTakes[e.id] || 0) > 0.005).map((e) => e.title)
  let result = balances()
  if (result.debts.length === 0 && (expenses.length > 0 || db.prepare('SELECT COUNT(*) c FROM settlements').get().c > 0)) {
    db.exec('DELETE FROM expenses; DELETE FROM settlements')
    notifyExcept('', { title: 'fridge’s clean — nothing owed anywhere', body: 'fresh slate. tap to see' }).catch(() => {})
    result = balances()
  }
  return c.json({ ok: true, cleared, ...result })
})

app.get('/api/v1/health', (c) => c.json({ ok: true, crew: 6, module: 'expenses', version: VERSION, build: BUILD, push: PUSH_ON }))

// --- Module: upi (pay-to handles, one per friend) ---
const VPA_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/
app.get('/api/v1/upi', (c) => {
  const rows = db.prepare('SELECT crew, vpa FROM upi_handles').all()
  return c.json({ handles: Object.fromEntries(rows.map((r) => [r.crew, r.vpa])) })
})

app.post('/api/v1/upi', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const crew = String(b.crew || '')
  const vpa = String(b.vpa || '').trim()
  if (!CREW.includes(crew) || !VPA_RE.test(vpa)) return c.text('bad upi id', 400)
  db.prepare('INSERT INTO upi_handles (crew, vpa) VALUES (?, ?) ON CONFLICT(crew) DO UPDATE SET vpa = excluded.vpa, updated_at = datetime(\'now\')').run(crew, vpa)
  return c.json({ ok: true })
})

// Allocation: oldest-first, exact from→to. PURE — no writes. Torn-ness,
// related lists and cleared responses all derive from this one pass, so a
// payment can never clear two bills and nothing is ever deleted implicitly.
function allocate() {
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY id ASC').all()
  const settles = db.prepare('SELECT * FROM settlements ORDER BY id ASC').all()
  const rem = new Map()
  for (const e of expenses) {
    const parts = breakdown(e)
    const m = {}
    for (const id of involvedList(e)) {
      if (id !== e.paid_by && (parts[id] || 0) > 0) m[id] = parts[id]
    }
    rem.set(e.id, m)
  }
  const takes = new Map()
  for (const s of settles) {
    let amt = s.amount
    const tk = {}
    for (const e of expenses) {
      if (amt <= 0.005) break
      if (e.paid_by !== s.to_id) continue
      const m = rem.get(e.id)
      const o = m[s.from_id] || 0
      if (o > 0.005) {
        const take = Math.min(o, amt)
        m[s.from_id] = Math.round((o - take) * 100) / 100
        amt = Math.round((amt - take) * 100) / 100
        tk[e.id] = Math.round(((tk[e.id] || 0) + take) * 100) / 100
      }
    }
    takes.set(s.id, tk)
  }
  const torn = new Set(expenses.filter((e) => Object.values(rem.get(e.id)).every((v) => v < 0.005)).map((e) => e.id))
  return { expenses, settles, rem, takes, torn }
}

// --- Module: push (Web Push subscriptions) ---

app.get('/api/v1/push/key', (c) => {
  if (!PUSH_ON) return c.text('pings off', 404)
  return c.json({ key: process.env.VAPID_PUBLIC_KEY })
})

app.post('/api/v1/push/subscribe', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const sub = b.subscription || {}
  const crew = String(b.crew || '')
  if (typeof sub.endpoint !== 'string' || !sub.endpoint || !sub.keys || !CREW.includes(crew)) {
    return c.text('bad subscription', 400)
  }
  db.prepare('INSERT INTO subscriptions (endpoint, keys, crew) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET keys = excluded.keys, crew = excluded.crew')
    .run(sub.endpoint, JSON.stringify(sub.keys), crew)
  return c.json({ ok: true })
})

app.post('/api/v1/push/unsubscribe', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  if (typeof b.endpoint === 'string' && b.endpoint) {
    db.prepare('DELETE FROM subscriptions WHERE endpoint = ?').run(b.endpoint)
  }
  return c.json({ ok: true })
})

// --- Module: wall (sticky-note memories for the 6) ---
const WALL_COLORS = ['#d8ff3e', '#ff5c1f', '#7ef0c1', '#ffd23e', '#ff7ab8', '#8ec5ff']
app.get('/api/v1/memories', (c) => {
  const rows = db.prepare('SELECT * FROM memories ORDER BY done ASC, id DESC LIMIT 100').all()
  return c.json({ memories: rows.map((r) => ({ id: r.id, author: r.author, text: r.text, color: r.color, done: r.done ? 1 : 0, createdAt: r.created_at + 'Z' })) })
})

app.post('/api/v1/memories', async (c) => {
  const b = await c.req.json()
  const author = String(b.author || '')
  const text = String(b.text || '').trim()
  if (!text || text.length > 280) return c.text('bad memory', 400)
  const color = WALL_COLORS.includes(b.color) ? b.color : WALL_COLORS[0]
  if (!CREW.includes(author) || !text) return c.text('bad memory', 400)
  const r = db.prepare('INSERT INTO memories (author, text, color) VALUES (?, ?, ?) RETURNING id').get(author, text, color)
  notifyExcept(author, { title: `${firstName(author)} pinned a go-to`, body: text.slice(0, 90) }).catch(() => {})
  return c.json({ id: r.id })
})

app.patch('/api/v1/memories/:id', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const id = Number(c.req.param('id'))
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
  db.prepare('UPDATE memories SET done = ? WHERE id = ?').run(b.done ? 1 : 0, id)
  if (row) {
    const verb = b.done ? 'crossed off' : 'brought back'
    notifyExcept('', { title: `${firstName(row.author)} ${verb} “${row.text.slice(0, 60)}”`, body: 'tap to see the go-to list' }).catch(() => {})
  }
  return c.json({ ok: true })
})

app.delete('/api/v1/memories/:id', (c) => {
  const id = Number(c.req.param('id'))
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
  db.prepare('DELETE FROM memories WHERE id = ?').run(id)
  if (row) notifyExcept('', { title: `unpinned: “${row.text.slice(0, 60)}”`, body: 'tap to see the go-to list' }).catch(() => {})
  return c.json({ ok: true })
})

// --- Module: changelog (what's new, crew-writable) ---
db.exec(`CREATE TABLE IF NOT EXISTS changelog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`)
if (!db.prepare('SELECT COUNT(*) AS c FROM changelog').get().c) {
  const ins = db.prepare('INSERT INTO changelog (text) VALUES (?)')
  for (const t of [
    'pings are here — switch them on from home and the phone buzzes for bills, sorts and pins',
    'go-to list: tap a pin to cross it off, crossed ones sink down',
    'the fridge is personal now — just my bills, with a show-everyone flip',
    'freshness: the app reloads itself onto every update, no more stale screens',
    '6–7 splash on launch. tap to open. you know the move.',
  ]) ins.run(t)
}

app.get('/api/v1/changelog', (c) => {
  const rows = db.prepare('SELECT * FROM changelog ORDER BY id DESC LIMIT 50').all()
  return c.json({ entries: rows.map((r) => ({ id: r.id, text: r.text, createdAt: r.created_at + 'Z' })) })
})

app.post('/api/v1/changelog', async (c) => {
  if (!process.env.DEV_KEY || c.req.header('x-dev-key') !== process.env.DEV_KEY) return c.text('dev only', 403)
  const b = await c.req.json().catch(() => ({}))
  const text = String(b.text || '').trim()
  if (!text || text.length > 280) return c.text('bad entry', 400)
  const r = db.prepare('INSERT INTO changelog (text) VALUES (?) RETURNING id').get(text)
  notifyExcept('', { title: 'what’s new in UntilManali', body: text.slice(0, 90) }).catch(() => {})
  return c.json({ id: r.id })
})

// --- Static: dist (vite build), held in RAM. Whole app is ~300KB,
// so one boot read beats disk on every tap. Restart picks up rebuilds.
const DIST = 'dist'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' }
const CACHE = new Map()
function collect(dir, base = '') {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name
    const full = join(dir, e.name)
    if (e.isDirectory()) { collect(full, rel); continue }
    const st = statSync(full)
    if (!st.isFile() || st.size > 2 * 1024 * 1024) continue
    CACHE.set('/' + rel, { body: readFileSync(full), type: MIME[extname(full)] || 'application/octet-stream' })
  }
}
try { collect(DIST) } catch { /* run pnpm build first */ }
const BUILD = createHash('sha256').update(CACHE.get('/index.html')?.body ?? 'missing').digest('hex').slice(0, 12)
// Cache-bust the icon URLs per deploy so browsers refetch the tab icon.
{
  const idx = CACHE.get('/index.html')
  if (idx) {
    const v = `?v=${BUILD}`
    idx.body = Buffer.from(idx.body.toString().replaceAll('/favicon.ico"', `/favicon.ico${v}"`).replaceAll('/fist-192.png"', `/fist-192.png${v}"`))
  }
}

app.get('/*', (c) => {
  const key = c.req.path === '/' ? '/index.html' : c.req.path
  const f = CACHE.get(key) || (!key.startsWith('/api/') ? CACHE.get('/index.html') : null)
  if (!f) return c.text('build first: pnpm build', 404)
  c.header('content-type', f.type)
  const fresh = key === '/index.html' || key === '/sw.js' || key === '/registerSW.js' || key === '/favicon.ico' || key.endsWith('.webmanifest')
  c.header('cache-control', fresh ? 'no-cache' : 'public, max-age=31536000, immutable')
  return c.body(f.body)
})

scheduleDigest()
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`UntilManali on http://localhost:${PORT}`)
})
