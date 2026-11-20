// UntilManali — composition root. Owns data, verse + sheet navigation, and
// the outcomes (settle/tear/pick). Verses and sheets own their own drafts,
// so typing in a sheet never re-renders the world behind it.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ME_KEY } from './crew'
import { api, type Balances, type Expense, type LogEntry, type Memory, type Settle } from './api'
import { buzz } from './feel'
import { first, inr, pathFor, verseFromLocation, type Verse } from './lib/format'
import { useFreshness } from './hooks/useFreshness'
import { pushOk, usePush } from './hooks/usePush'
import HomeVerse from './components/HomeVerse'
import BillsVerse, { type DebtLine } from './components/BillsVerse'
import WallVerse from './components/WallVerse'
import Splash from './components/Splash'
import Gate from './components/Gate'
import PingAsk from './components/PingAsk'
import ExpenseSheet from './components/sheets/ExpenseSheet'
import MemorySheet from './components/sheets/MemorySheet'
import LogSheet from './components/sheets/LogSheet'
import { ConfirmSettleSheet, ConfirmTearSheet } from './components/sheets/ConfirmSheets'

type Sheet = 'expense' | 'memory' | 'log' | 'confirmSettle' | 'confirmTear' | null

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [bal, setBal] = useState<Balances | null>(null)
  const [wall, setWall] = useState<Memory[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [upi, setUpi] = useState<Record<string, string>>({})
  const [verse, setVerse] = useState<Verse>(verseFromLocation)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [mineOnly, setMineOnly] = useState(true)
  const [me, setMe] = useState(() => localStorage.getItem(ME_KEY) || '')
  const [picked, setPicked] = useState(() => !!localStorage.getItem(ME_KEY))
  const [pendingSettle, setPendingSettle] = useState<DebtLine | null>(null)
  const [pendingTear, setPendingTear] = useState<Expense | null>(null)
  const [tearRelated, setTearRelated] = useState<Settle[]>([])
  const [err, setErr] = useState('')
  const [flash, setFlash] = useState('')
  const [ss, setSs] = useState(() => {
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      return !nav || nav.type === 'navigate'
    } catch { return true }
  })
  const [pingAsk, setPingAsk] = useState(false)

  async function load(silent = false) {
    try {
      if (!silent) setErr('')
      const [e, b, w, l, u] = await Promise.all([api.list(), api.balances(), api.wall(), api.log(), api.upi()])
      setExpenses(e.expenses); setBal(b); setWall(w.memories); setLog(l.entries); setUpi(u.handles)
    } catch (e) { if (!silent) setErr(e instanceof Error ? e.message : 'could not reach home base') }
  }
  useEffect(() => { load() }, [])
  useFreshness(load)
  const { pushOn, togglePush } = usePush(me, setErr)

  // Verse + sheet navigation. A sheet pushes one #dlg entry, so the back
  // button closes the sheet first instead of leaving the verse.
  function go(v: Verse) {
    setVerse(v)
    window.scrollTo(0, 0)
    const path = pathFor(v)
    if (window.location.pathname !== path) window.history.pushState({ verse: v }, '', path)
  }
  const sheetRef = useRef<Sheet>(null)
  useEffect(() => { sheetRef.current = sheet }, [sheet])
  const dlgOpen = useRef(false)
  function openSheet(s: NonNullable<Sheet>) {
    setSheet(s)
    if (!dlgOpen.current) {
      dlgOpen.current = true
      window.history.pushState({ sheet: s }, '', window.location.pathname + '#dlg')
    }
  }
  function closeSheet() {
    if (dlgOpen.current) window.history.back()
    else setSheet(null)
  }
  useEffect(() => {
    const onPop = () => {
      if (sheetRef.current) {
        dlgOpen.current = false
        setPendingSettle(null); setPendingTear(null); setTearRelated([])
        setSheet(null)
        return
      }
      setVerse(verseFromLocation())
      window.scrollTo(0, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // One light tap for every touchable thing; bigger moments buzz on their own.
  useEffect(() => {
    const onTouch = (e: Event) => {
      if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) buzz('tap')
    }
    document.addEventListener('pointerdown', onTouch)
    return () => document.removeEventListener('pointerdown', onTouch)
  }, [])

  function pick(id: string) {
    buzz('select')
    setMe(id)
    localStorage.setItem(ME_KEY, id)
    setPicked(true)
  }

  // One friendly ask per launch: pings on, once the splash is gone.
  useEffect(() => {
    if (verse === 'home' && !ss && !pushOn && pushOk
      && 'Notification' in window && Notification.permission === 'default'
      && !sessionStorage.getItem('um-ping-asked')) {
      setPingAsk(true)
    }
  }, [verse, ss, pushOn])
  const dismissPingAsk = () => { sessionStorage.setItem('um-ping-asked', '1'); setPingAsk(false) }

  // Outcomes: settle + tear live here so every verse shares them.
  // The busy flag eats double-taps — one tap, one write, always.
  const busy = useRef(false)
  async function confirmSettle() {
    if (!pendingSettle || busy.current) return
    busy.current = true
    try {
      const done = pendingSettle
      await api.settle(done)
      setPendingSettle(null); closeSheet(); load()
      buzz('go')
      setFlash(`✓ ${first(done.from)} → ${first(done.to)} · ${inr(done.amount)} sorted`)
      setTimeout(() => setFlash(''), 4500)
    } catch (e) { buzz('nope'); setErr(e instanceof Error ? e.message : 'did not stick, try again') }
    finally { busy.current = false }
  }

  async function confirmTear(withSettlements: boolean) {
    if (!pendingTear || busy.current) return
    busy.current = true
    try {
      await api.remove(pendingTear.id, withSettlements)
      setPendingTear(null); setTearRelated([]); closeSheet(); load()
      buzz('go')
    } catch (e) { buzz('nope'); setErr(e instanceof Error ? e.message : 'did not stick, try again') }
    finally { busy.current = false }
  }

  async function askTear(e: Expense) {
    try {
      const r = await api.related(e.id)
      setTearRelated(r.settlements)
    } catch { setTearRelated([]) }
    setPendingTear(e); openSheet('confirmTear')
  }

  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses])
  const debts = bal?.debts ?? []
  const myNet = bal?.net?.[me] ?? 0
  const myDebts = useMemo(() => debts.filter((d) => d.from === me || d.to === me), [debts, me])
  const myExpenses = useMemo(() => expenses.filter((e) => e.involved.includes(me) || e.paidBy === me), [expenses, me])

  return (
    <>
      <div className="wall" aria-hidden />
      <div className="wrap">
        {verse === 'home' && (
          <HomeVerse
            me={me} total={total} myNet={myNet}
            myBillCount={myExpenses.length} myDebtCount={myDebts.length}
            gotoCount={wall.length} logCount={log.length}
            pushOn={pushOn} onPick={pick} onGo={go}
            onWhatsNew={() => openSheet('log')} onShowSplash={() => setSs(true)}
            onTogglePush={togglePush}
          />
        )}

        {verse === 'bills' && (
          <BillsVerse
            me={me} mineOnly={mineOnly}
            expenses={mineOnly ? myExpenses : expenses}
            debts={mineOnly ? myDebts : debts}
            upi={upi} onToggleMineOnly={() => setMineOnly(!mineOnly)}
            onAskSettle={(d) => { setPendingSettle(d); openSheet('confirmSettle') }}
            onAskTear={askTear}
          />
        )}

        {verse === 'wall' && (
          <WallVerse wall={wall} onChanged={() => load()} onPin={() => openSheet('memory')} />
        )}

        {err && <div><span className="errtape">{err}</span></div>}
        {flash && <div><span className="oktape">{flash}</span></div>}
      </div>

      {ss && <Splash onClose={() => setSs(false)} />}

      {pingAsk && !pushOn && (
        <PingAsk onLater={dismissPingAsk} onSwitchOn={async () => { await togglePush(); dismissPingAsk() }} />
      )}

      {!picked && !ss && <Gate onPick={pick} />}

      <nav className="nav" aria-label="Spaces">
        {(['home', 'bills', 'wall'] as Verse[]).map((v) => (
          <button key={v} aria-current={verse === v} onClick={() => go(v)}>
            {v === 'home' ? 'home' : v === 'bills' ? 'fridge' : 'go-tos'}
          </button>
        ))}
      </nav>

      {verse === 'bills' && !sheet && (
        <button className="fab-round" aria-label="Stick a new bill" onClick={() => openSheet('expense')}>+</button>
      )}
      {verse === 'wall' && !sheet && (
        <button className="fab-round" aria-label="Pin a memory" onClick={() => openSheet('memory')}>+</button>
      )}

      {sheet && (
        <>
          <div className="scrim" onClick={() => closeSheet()} />
          <div className="sheet" role="dialog" aria-label="Crew dialog">
            {sheet === 'expense' && (
              <ExpenseSheet me={me} onClose={closeSheet} onSaved={() => load()} onErr={setErr} />
            )}
            {sheet === 'memory' && (
              <MemorySheet me={me} onClose={closeSheet} onSaved={() => load()} onErr={setErr} />
            )}
            {sheet === 'log' && (
              <LogSheet entries={log} onClose={closeSheet} onPosted={() => load()} onErr={setErr} />
            )}
            {sheet === 'confirmTear' && (
              <ConfirmTearSheet
                pending={pendingTear} related={tearRelated}
                onKeep={() => { setPendingTear(null); setTearRelated([]); closeSheet() }}
                onTearBill={() => confirmTear(false)} onTearAll={() => confirmTear(true)}
              />
            )}
            {sheet === 'confirmSettle' && (
              <ConfirmSettleSheet
                pending={pendingSettle}
                onCancel={() => { setPendingSettle(null); closeSheet() }}
                onConfirm={confirmSettle}
              />
            )}
          </div>
        </>
      )}
    </>
  )
}
