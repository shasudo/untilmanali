// Home verse: the crew wheel + jump cards. Tap-only motion: the orb spins
// and the hub bumps exactly when a face is picked, never on its own.
import { useState } from 'react'
import { CREW } from '../crew'
import { first, inr, type Verse } from '../lib/format'
import { pushBlocked, pushOk } from '../hooks/usePush'

const WHEEL_R = 124

type Props = {
  me: string
  total: number
  myNet: number
  myBillCount: number
  myDebtCount: number
  gotoCount: number
  logCount: number
  pushOn: boolean
  onPick: (id: string) => void
  onGo: (v: Verse) => void
  onWhatsNew: () => void
  onShowSplash: () => void
  onTogglePush: () => void
}

export default function HomeVerse(p: Props) {
  const [zap, setZap] = useState({ id: '', n: 0 })
  const pick = (id: string) => {
    p.onPick(id)
    setZap((z) => ({ id, n: z.n + 1 }))
  }

  return (
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
              <button className={'orb' + (live ? ' zap' : '')} aria-pressed={p.me === c.id} onClick={() => pick(c.id)}>
                <span className="otag">{c.tag}</span>
                <span className="oname">{first(c.id)}</span>
              </button>
            </span>
          )
        })}
        <div key={'h' + zap.n} className={'hub' + (zap.n ? ' bump' : '')}>
          <small>{first(p.me)} · {inr(p.total)}</small>
          <b>{p.myNet === 0 ? 'even steven' : p.myNet > 0 ? `gets ${inr(p.myNet)}` : `owes ${inr(-p.myNet)}`}</b>
        </div>
      </div>

      <div className="jumps">
        <button className="jump" onClick={() => p.onGo('bills')}>
          open my fridge <small>{p.myBillCount} with my name · {inr(p.total)} in pot</small>
        </button>
        {p.myDebtCount > 0 && (
          <button className="jump" onClick={() => p.onGo('bills')}>
            sorting out <small>{p.myDebtCount} of mine to sort</small>
          </button>
        )}
        <button className="jump" onClick={() => p.onGo('wall')}>
          the go-to list <small>{p.gotoCount} pins</small>
        </button>
        <button className="jump" onClick={p.onTogglePush}>
          notification <small>{p.pushOn ? `on for ${first(p.me)}` : pushBlocked ? 'blocked in browser settings' : pushOk ? 'off — tap to switch on' : 'not on this browser'}</small>
        </button>
        <button className="jump" onClick={p.onShowSplash}>
          6–7 <small>certified brainrot</small>
        </button>
        <button className="jump" onClick={p.onWhatsNew}>
          what’s new <small>{p.logCount} notes</small>
        </button>
      </div>
    </section>
  )
}
