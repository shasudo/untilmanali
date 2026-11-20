import { useEffect, useMemo, useState } from 'react'
import { CREW, ME_KEY, crewById } from './crew'
import { api, urlBase64ToUint8Array, type Expense, type Balances, type Memory, type LogEntry, type Settle } from './api'

const WALL_COLORS = ['#d8ff3e', '#ff5c1f', '#7ef0c1', '#ffd23e', '#ff7ab8', '#8ec5ff']
const WHEEL_R = 124

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
const first = (id: string) => crewById(id).name.split(' ')[0]

type Verse = 'home' | 'bills' | 'wall'

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [bal, setBal] = useState<Balances | null>(null)
  const [wall, setWall] = useState<Memory[]>([])
  const [verse, setVerse] = useState<Verse>('home')
  const [mineOnly, setMineOnly] = useState(true)
  const [me, setMe] = useState(() => localStorage.getItem(ME_KEY) || '')
  const [picked, setPicked] = useState(() => !!localStorage.getItem(ME_KEY))
  const [sheet, setSheet] = useState<'expense' | 'memory' | 'log' | 'confirmSettle' | 'confirmTear' | null>(null)
  const [pendingSettle, setPendingSettle] = useState<{ from: string; to: string; amount: number } | null>(null)
  const [pendingTear, setPendingTear] = useState<Expense | null>(null)
  const [tearRelated, setTearRelated] = useState<Settle[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [newLog, setNewLog] = useState('')
  const [upi, setUpi] = useState<Record<string, string>>({})
  const [devKey, setDevKey] = useState(() => localStorage.getItem('untilmanali.devkey') || '')
  const [err, setErr] = useState('')
  const [form, setForm] = useState<{ title: string; amount: string; split: string; involved: string[]; shares: Record<string, string> }>({ title: '', amount: '', split: 'equal', involved: [], shares: {} })
  const [note, setNote] = useState({ text: '', color: WALL_COLORS[0] })

  async function load(silent = false) {
    try {
      if (!silent) setErr('')
      const [e, b, w, l, u] = await Promise.all([api.list(), api.balances(), api.wall(), api.log(), api.upi()])
      setExpenses(e.expenses); setBal(b); setWall(w.memories); setLog(l.entries); setUpi(u.handles)
    } catch (e) { if (!silent) setErr(e instanceof Error ? e.message : 'could not reach home base') }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (me) localStorage.setItem(ME_KEY, me) }, [me])

  // Aggressive freshness for 6 people: new build? take it now.
  // Same build? still re-pull the data — an open tab must never go stale.
  // Retries until the new build actually runs — never pins a tab on stale code.
  useEffect(() => {
    let dead = false
    let timer: ReturnType<typeof setInterval> | undefined
    const check = async (refreshData = true) => {
      try {
        const h = await (await fetch('/api/v1/health', { cache: 'no-store' })).json() as { build?: string }
        if (dead || !h.build) return
        if (h.build !== __BUILD_ID__ && sessionStorage.getItem('um-fresh') !== h.build) {
          sessionStorage.setItem('um-fresh', h.build)
          try { await navigator.serviceWorker?.getRegistration?.().then((r) => r?.update()) } catch { /* old worker stays */ }
          location.reload()
          return
        }
        if (refreshData && !dead) await load(true)
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

  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses])
  const myNet = bal?.net?.[me] ?? 0
  const debts = bal?.debts ?? []
  const myExpenses = useMemo(() => expenses.filter((e) => e.involved.includes(me) || e.paidBy === me), [expenses, me])
  const myDebts = useMemo(() => debts.filter((d) => d.from === me || d.to === me), [debts, me])
  const showExpenses = mineOnly ? myExpenses : expenses
  const showDebts = mineOnly ? myDebts : debts
  const amt = Math.round(Number(form.amount) * 100) / 100 || 0
  const sumShares = Object.values(form.shares).reduce((s, v) => s + (Number(v) || 0), 0)

  const [zap, setZap] = useState({ id: '', n: 0 })
  const [ss, setSs] = useState(true)
  const [pingAsk, setPingAsk] = useState(false)
  const [pushOn, setPushOn] = useState(() => localStorage.getItem('untilmanali.push') === '1')
  const pushOk = typeof window !== 'undefined' && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator
  const pushBlocked = typeof window !== 'undefined' && typeof Notification !== 'undefined' && Notification.permission === 'denied'
  function pick(id: string) {
    setMe(id)
    localStorage.setItem(ME_KEY, id)
    setPicked(true)
    setZap((z) => ({ id, n: z.n + 1 }))
  }

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
      if (!pushOk) { setErr('pings need a modern phone browser'); return }
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
        setErr('pings blocked — allow them in the browser settings, then tap again')
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
    } catch (e) { setErr(friendlyPushErr(e)) }
  }

  // One friendly ask per launch: pings on, once the splash is gone.
  useEffect(() => {
    if (verse === 'home' && !ss && !pushOn && pushOk
      && typeof Notification !== 'undefined' && Notification.permission === 'default'
      && !sessionStorage.getItem('um-ping-asked')) {
      setPingAsk(true)
    }
  }, [verse, ss, pushOn, pushOk])

  // Keep the server's copy of this phone pointed at whoever is picked.
  useEffect(() => {
    if (!pushOn || !pushOk) return
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      if (sub) api.sub({ subscription: sub.toJSON(), crew: me }).catch(() => {})
    }).catch(() => {})
  }, [me, pushOn])

  function toggleInvolved(id: string) {
    setForm((f) => {
      const has = f.involved.includes(id)
      return { ...f, involved: has ? f.involved.filter((x) => x !== id) : [...f.involved, id] }
    })
  }

  async function submitExpense() {
    if (!form.title.trim() || !(amt > 0)) { setErr('give it a name and a number, even a rough one'); return }
    if (!form.involved.length) { setErr("tap who's in — even one counts"); return }
    const shares: Record<string, number> = {}
    if (form.split !== 'equal') {
      for (const id of form.involved) shares[id] = Number(form.shares[id] || 0)
      const sum = Object.values(shares).reduce((a, b) => a + b, 0)
      const need = form.split === 'percent' ? 100 : amt
      const unit = form.split === 'percent' ? '%' : '₹'
      if (Math.abs(sum - need) > 0.01) { setErr(`those bits add to ${unit}${sum}, need ${unit}${need}`); return }
    }
    try {
      await api.add({ title: form.title.trim(), amount: amt, paidBy: me, split: form.split, involved: form.involved, shares })
      setForm({ title: '', amount: '', split: 'equal', involved: [], shares: {} })
      setSheet(null); load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'did not stick, try again') }
  }

  async function submitNote() {
    if (!note.text.trim()) { setErr('write something first, even one line'); return }
    try {
      await api.pin({ author: me, text: note.text.trim(), color: note.color })
      setNote({ text: '', color: WALL_COLORS[0] }); setSheet(null); load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'did not stick, try again') }
  }

  async function confirmSettle() {
    if (!pendingSettle) return
    try {
      await api.settle(pendingSettle)
      setPendingSettle(null); setSheet(null); load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'did not stick, try again') }
  }

  async function confirmTear(withSettlements: boolean) {
    if (!pendingTear) return
    try {
      await api.remove(pendingTear.id, withSettlements)
      setPendingTear(null); setTearRelated([]); setSheet(null); load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'did not stick, try again') }
  }

  async function askTear(e: Expense) {
    try {
      const r = await api.related(e.id)
      setTearRelated(r.settlements)
    } catch { setTearRelated([]) }
    setPendingTear(e); setSheet('confirmTear')
  }

  async function submitLog() {
    if (!newLog.trim()) { setErr('write the news first'); return }
    try {
      await api.addLog(newLog.trim(), devKey || undefined)
      setNewLog(''); load()
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      if (m.includes('dev only')) {
        localStorage.removeItem('untilmanali.devkey'); setDevKey('')
        setErr('that dev key did not work')
      } else setErr(m || 'did not stick, try again')
    }
  }

  function unlockDev() {
    const k = window.prompt('dev key:')
    if (k && k.trim()) { localStorage.setItem('untilmanali.devkey', k.trim()); setDevKey(k.trim()) }
  }

  const payLink = (to: string, amount: number) =>
    `upi://pay?pa=${encodeURIComponent(upi[to])}&pn=${encodeURIComponent(first(to))}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('UntilManali')}`

  function openExpense() {
    setForm((f) => ({ ...f, involved: [] }))
    setSheet('expense')
  }

  return (
    <>
      <div className="wall" aria-hidden />
      <div className="wrap">
        {verse === 'home' && (
          <section className="verse" key="home">
            <header className="crewhead">
              <h1 className="marker-title">until <u>manali</u></h1>
              <div className="lefthint">
                <span className="hintline">the crew wheel. tap yourself, then go spend.</span>
              </div>
            </header>

            <div className="wheel" role="group" aria-label="Who are you?">
              {CREW.map((c, i) => {
                const a = i * (360 / CREW.length) - 90
                const live = zap.id === c.id
                return (
                  <span key={live ? c.id + zap.n : c.id} className="spoke" style={{ transform: `rotate(${a}deg) translate(${WHEEL_R}px) rotate(${-a}deg)` }}>
                    <button className={'orb' + (live ? ' zap' : '')} aria-pressed={me === c.id} onClick={() => pick(c.id)}>
                      <span className="otag">{c.tag}</span>
                      <span className="oname">{first(c.id)}</span>
                    </button>
                  </span>
                )
              })}
              <div key={'h' + zap.n} className={'hub' + (zap.n ? ' bump' : '')}>
                <small>{first(me)} · {inr(total)}</small>
                <b>{myNet === 0 ? 'even steven' : myNet > 0 ? `gets ${inr(myNet)}` : `owes ${inr(-myNet)}`}</b>
              </div>
            </div>

            <div className="jumps">
              <button className="jump" onClick={() => setVerse('bills')}>
                open my fridge <small>{myExpenses.length} with my name · {inr(total)} in pot</small>
              </button>
              {myDebts.length > 0 && (
                <button className="jump" onClick={() => setVerse('bills')}>
                  sorting out <small>{myDebts.length} of mine to sort</small>
                </button>
              )}
              <button className="jump" onClick={() => setVerse('wall')}>
                the go-to list <small>{wall.length} pins</small>
              </button>
              <button className="jump" onClick={togglePush}>
                notification <small>{pushOn ? `on for ${first(me)}` : pushBlocked ? 'blocked in browser settings' : pushOk ? 'off — tap to switch on' : 'not on this browser'}</small>
              </button>
              <button className="jump" onClick={() => setSs(true)}>
                6–7 <small>certified brainrot</small>
              </button>
              <button className="jump" onClick={() => setSheet('log')}>
                what’s new <small>{log.length} notes</small>
              </button>
            </div>
          </section>
        )}

        {verse === 'bills' && (
          <section className="verse" key="bills">
            <h2 className="seclabel">{mineOnly ? `${first(me)}'s fridge` : 'the whole fridge'}</h2>
            <div className="whos-tools">
              <button onClick={() => setMineOnly(!mineOnly)}>{mineOnly ? 'show everyone' : 'just mine'}</button>
            </div>
            <div className="ious">
              {showDebts.length === 0 && <div className="empty">{mineOnly ? 'you owe nobody, nobody owes you. clean.' : 'nobody owes anybody. suspiciously peaceful.'}</div>}
              {showDebts.map((d, i) => (
                <div className="iou" key={i}>
                  <span className="iou-text">{first(d.from)} owes {first(d.to)} <b>{inr(d.amount)}</b></span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
                    {upi[d.to] && d.from === me && <a className="paylink" href={payLink(d.to, d.amount)} onClick={() => { setPendingSettle(d); setSheet('confirmSettle') }}>pay</a>}
                    <button className="stampbtn" onClick={() => { setPendingSettle(d); setSheet('confirmSettle') }}>sorted</button>
                  </span>
                </div>
              ))}
            </div>
            <section className="feed">
              {showExpenses.length === 0 && <div className="empty">{mineOnly ? 'nothing with your name on it. go make a memory.' : 'nothing here yet. first chai, first fuel — someone\'s buying.'}</div>}
              {showExpenses.map((e) => (
                <article className="stub-ticket" key={e.id}>
                  <div className="main">
                    <h3>{e.title}</h3>
                    <div className="paidline">
                      <span className="paidstamp" style={{ background: crewById(e.paidBy).color }}>{first(e.paidBy)} paid</span>
                      {e.split === 'equal' ? `split ${e.involved.length === 6 ? 'between everyone' : 'between ' + e.involved.map(first).join(', ')}`
                        : e.split === 'percent' ? 'by percent' : 'exact bits'} · {new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                    <div className="parts">
                      {Object.entries(e.breakdown).filter(([, v]) => v > 0).map(([id, v]) => (
                        <span key={id} className={'part' + (id === me ? ' me' : '')}>{first(id)} {inr(v)}</span>
                      ))}
                    </div>
                    {e.rounded && <div className="paidline">incl. ₹1 round-off — the odd paise went to the last head</div>}
                  </div>
                  <div className="stub">
                    <span className="amt">{inr(e.amount)}</span>
                                    <button className="tear" onClick={() => askTear(e)}>tear off</button>
                  </div>
                </article>
              ))}
            </section>
          </section>
        )}

        {verse === 'wall' && (
          <section className="verse" key="wall">
            <h2 className="seclabel">the go-to list · {wall.filter((m) => !m.done).length} to go</h2>
            <section className="notes">
              {wall.map((m) => (
                <div className={'note' + (m.done ? ' done' : '')} key={m.id} style={{ background: m.color }}
                  title={m.done ? 'tap to uncross' : 'tap to cross off'}
                  onClick={async () => { await api.cross(m.id, !m.done); load() }}>
                  <button className="x" aria-label="unpin" onClick={async (e) => { e.stopPropagation(); await api.unpin(m.id); load() }}>×</button>
                  <span className="notetext">{m.text}</span>
                  <small>— {first(m.author)}</small>
                </div>
              ))}
              <button className="addnote" onClick={() => setSheet('memory')}>+ pin a go-to…</button>
            </section>
            {wall.length === 0 && <p className="hintline" style={{ marginTop: 8 }}>first one writes itself: where were you when this pot started?</p>}
          </section>
        )}

        {err && <div><span className="errtape">{err}</span></div>}
      </div>

      {ss && (
        <div className="ss" role="button" aria-label="six seven — tap to stop" onClick={() => setSs(false)}>
          <div className="ss-word"><span style={{ color: '#d8ff3e' }}>SIX</span><span style={{ color: '#ff5c1f' }}>SEVEN</span></div>
          <div className="ss-plank"><span className="ss-puck l">6</span><span className="ss-puck r">7</span></div>
          <div className="ss-base" />
          <p className="hintline">both palms up. you know the move. tap to open.</p>
        </div>
      )}

      {pingAsk && !pushOn && (
        <>
          <div className="scrim" style={{ zIndex: 39 }} onClick={() => { sessionStorage.setItem('um-ping-asked', '1'); setPingAsk(false) }} />
          <div className="pop" role="dialog" aria-label="Switch pings on">
            <h2>hear the fridge buzz?</h2>
            <p>switch pings on and your phone shouts when anyone sticks a bill, sorts one, or pins a go-to.</p>
            <div className="saverow">
              <button className="cancel" onClick={() => { sessionStorage.setItem('um-ping-asked', '1'); setPingAsk(false) }}>later</button>
              <button className="save" onClick={async () => { await togglePush(); setPingAsk(false) }}>switch on</button>
            </div>
          </div>
        </>
      )}

      {!picked && !ss && (
        <div className="gate" role="dialog" aria-label="Who are you">
          <div className="gatecard">
            <h1 className="marker-title">who <u>are</u> you?</h1>
            <p className="hintline">one tap — this phone remembers you after this.</p>
            <div className="whos">
              {CREW.map((c) => (
                <button key={c.id} className="who" aria-pressed={false} onClick={() => pick(c.id)}>
                  <span className="phiz" style={{ background: c.color }}>{c.tag}</span><br />{first(c.id)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="nav" aria-label="Spaces">
        {(['home', 'bills', 'wall'] as Verse[]).map((v) => (
          <button key={v} aria-current={verse === v} onClick={() => { setVerse(v); window.scrollTo(0, 0) }}>
            {v === 'home' ? 'home' : v === 'bills' ? 'fridge' : 'go-tos'}
          </button>
        ))}
      </nav>

      {verse === 'bills' && !sheet && (
        <button className="fab-round" aria-label="Stick a new bill" onClick={openExpense}>+</button>
      )}
      {verse === 'wall' && !sheet && (
        <button className="fab-round" aria-label="Pin a memory" onClick={() => setSheet('memory')}>+</button>
      )}

      {sheet && (
        <>
          <div className="scrim" onClick={() => setSheet(null)} />
          <div className="sheet" role="dialog" aria-label="Crew dialog">
            {sheet === 'expense' ? (
              <>
                <h2>new bill on the fridge</h2>
                <label className="f">what was it<input className="t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="fuel after chandigarh" maxLength={60} /></label>
                <label className="f">how much<input className="t" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1200" /></label>
                <p className="livecalc">paid by you · {first(me)} — sticking a bill someone else paid? tap their face first</p>
                <label className="f">who was in on it</label>
                <div className="whos-tools">
                  <button onClick={() => setForm({ ...form, involved: CREW.map((c) => c.id) })}>all six</button>
                  <button onClick={() => setForm({ ...form, involved: [] })}>clear</button>
                </div>
                <div className="whos">
                  {CREW.map((c) => (
                    <button key={c.id} className="who" aria-pressed={form.involved.includes(c.id)} onClick={() => toggleInvolved(c.id)}>
                      <span className="phiz" style={{ background: c.color }}>{c.tag}</span><br />{first(c.id)}
                    </button>
                  ))}
                </div>
                <div className="seg">
                  {(['equal', 'custom', 'percent'] as const).map((s) => (
                    <button key={s} aria-pressed={form.split === s} onClick={() => setForm({ ...form, split: s })}>
                      {s === 'equal' ? 'even steven' : s === 'custom' ? 'exact ₹' : 'by %'}
                    </button>
                  ))}
                </div>
                {form.split !== 'equal' && (
                  <div className="shares">
                    {form.involved.map((id) => (
                      <label key={id}>{first(id)} {form.split === 'percent' ? '%' : '₹'}
                        <input inputMode="decimal" value={form.shares[id] || ''} placeholder="0"
                          onChange={(e) => setForm({ ...form, shares: { ...form.shares, [id]: e.target.value } })} />
                      </label>
                    ))}
                  </div>
                )}
                {form.split === 'equal' && amt > 0 && (
                  form.involved.length
                    ? <p className="livecalc">≈ {inr(Math.round(amt / form.involved.length))} each for the {form.involved.length} of you in on it</p>
                    : <p className="livecalc">tap who's in first, then watch the math</p>
                )}
                {form.split !== 'equal' && (
                  <p className="livecalc">bits so far: {form.split === 'percent' ? `${sumShares}% of 100%` : `${inr(sumShares)} of ${inr(amt)}`}</p>
                )}
                <div className="saverow">
                  <button className="cancel" onClick={() => setSheet(null)}>nah</button>
                  <button className="save" onClick={submitExpense}>stick it up</button>
                </div>
              </>
            ) : sheet === 'memory' ? (
              <>
                <h2>pin it before you forget</h2>
                <label className="f">the memory<textarea className="t" value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} placeholder="rushi tried to pay with exact change again…" maxLength={280} /></label>
                <label className="f">pick a sticky</label>
                <div className="swatches">
                  {WALL_COLORS.map((c) => (
                    <button key={c} aria-pressed={note.color === c} style={{ background: c }} aria-label={c} onClick={() => setNote({ ...note, color: c })} />
                  ))}
                </div>
                <div className="saverow">
                  <button className="cancel" onClick={() => setSheet(null)}>nah</button>
                  <button className="save" onClick={submitNote}>pin it — {first(me)}</button>
                </div>
              </>
            ) : sheet === 'log' ? (
              <>
                <h2>what’s new</h2>
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  {log.length === 0 && <div className="empty">nothing yet. history starts here.</div>}
                  {log.map((e) => (
                    <div className="logrow" key={e.id}>{e.text}<small>{new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small></div>
                  ))}
                </div>
                {devKey ? (
                  <>
                    <label className="f">add a line<textarea className="t" value={newLog} onChange={(e) => setNewLog(e.target.value)} placeholder="pings now buzz for crossed-off go-tos…" maxLength={280} /></label>
                    <div className="saverow">
                      <button className="cancel" onClick={() => setSheet(null)}>close</button>
                      <button className="save" onClick={submitLog}>post it</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="whos-tools">
                      <button onClick={unlockDev}>dev? add news</button>
                    </div>
                    <div className="saverow">
                      <button className="cancel" onClick={() => setSheet(null)}>close</button>
                    </div>
                  </>
                )}
              </>
            ) : sheet === 'confirmTear' ? (
              <>
                <h2>tear it off?</h2>
                <p className="hintline">{pendingTear ? `“${pendingTear.title}” · ${inr(pendingTear.amount)} — gone for everyone, no undo.` : ''}</p>
                {tearRelated.length > 0 && (
                  <p className="hintline">{tearRelated.length} payment{tearRelated.length === 1 ? '' : 's'} point{tearRelated.length === 1 ? 's' : ''} at this bill ({tearRelated.map((s) => `${first(s.from)} ₹${Math.round(s.amount)}`).join(', ')}) — take {tearRelated.length === 1 ? 'it' : 'them'} along, or leave {tearRelated.length === 1 ? 'it' : 'them'} standing.</p>
                )}
                <div className="saverow">
                  <button className="cancel" onClick={() => { setPendingTear(null); setTearRelated([]); setSheet(null) }}>keep it</button>
                  <button className="cancel" onClick={() => confirmTear(false)}>bill only</button>
                  {tearRelated.length > 0 && <button className="save" onClick={() => confirmTear(true)}>bill + ₹{Math.round(tearRelated.reduce((s, x) => s + x.amount, 0))}</button>}
                  {tearRelated.length === 0 && <button className="save" onClick={() => confirmTear(false)}>tear it</button>}
                </div>
              </>
            ) : (
              <>
                <h2>mark sorted?</h2>
                <p className="hintline">{pendingSettle ? `${first(pendingSettle.from)} → ${first(pendingSettle.to)} · ${inr(pendingSettle.amount)}` : ''} — tap “yes, paid” only if the money really moved.</p>
                <div className="saverow">
                  <button className="cancel" onClick={() => { setPendingSettle(null); setSheet(null) }}>cancel</button>
                  <button className="save" onClick={confirmSettle}>yes, paid</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
