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
  const rows = db.prepare('SELECT * FROM expenses ORDER BY id DESC LIMIT 300').all()
  return c.json({
    expenses: rows.map((r) => ({
      id: r.id, title: r.title, amount: r.amount, paidBy: r.paid_by,
      split: r.split, shares: JSON.parse(r.shares || '{}'),
      involved: involvedList(r), breakdown: breakdown(r),
      createdAt: r.created_at + 'Z',
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

app.delete('/api/v1/expenses/:id', (c) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(c.req.param('id')))
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
  db.prepare('INSERT INTO settlements (from_id, to_id, amount) VALUES (?, ?, ?)').run(from, to, Math.round(Number(amount) * 100) / 100)
  notifyExcept(from, { title: `${firstName(from)} sorted ₹${amount} to ${firstName(to)}`, body: 'debts updated — tap to see' }).catch(() => {})
  return c.json({ ok: true, ...balances() })
})

app.get('/api/v1/health', (c) => c.json({ ok: true, crew: 6, module: 'expenses', version: VERSION, build: BUILD, push: PUSH_ON }))

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
  const text = String(b.text || '').trim().slice(0, 280)
  const color = WALL_COLORS.includes(b.color) ? b.color : WALL_COLORS[0]
  if (!CREW.includes(author) || !text) return c.text('bad memory', 400)
  const r = db.prepare('INSERT INTO memories (author, text, color) VALUES (?, ?, ?) RETURNING id').get(author, text, color)
  notifyExcept(author, { title: `${firstName(author)} pinned a go-to`, body: text.slice(0, 90) }).catch(() => {})
  return c.json({ id: r.id })
})

app.patch('/api/v1/memories/:id', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  db.prepare('UPDATE memories SET done = ? WHERE id = ?').run(b.done ? 1 : 0, Number(c.req.param('id')))
  return c.json({ ok: true })
})

app.delete('/api/v1/memories/:id', (c) => {
  db.prepare('DELETE FROM memories WHERE id = ?').run(Number(c.req.param('id')))
  return c.json({ ok: true })
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

app.get('/*', (c) => {
  const key = c.req.path === '/' ? '/index.html' : c.req.path
  const f = CACHE.get(key) || (!key.startsWith('/api/') ? CACHE.get('/index.html') : null)
  if (!f) return c.text('build first: pnpm build', 404)
  c.header('content-type', f.type)
  const fresh = key === '/index.html' || key === '/sw.js' || key === '/registerSW.js' || key.endsWith('.webmanifest')
  c.header('cache-control', fresh ? 'no-cache' : 'public, max-age=31536000, immutable')
  return c.body(f.body)
})

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`UntilManali on http://localhost:${PORT}`)
})
