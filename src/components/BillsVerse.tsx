// Fridge verse: who owes whom + the bill tickets. Personal by default,
// whole-crew on flip. Only the debtor's own lines carry a pay link.
import { crewById } from '../crew'
import { first, inr, payLink } from '../lib/format'
import type { Expense } from '../api'

export type DebtLine = { from: string; to: string; amount: number }

type Props = {
  me: string
  mineOnly: boolean
  expenses: Expense[]
  debts: DebtLine[]
  upi: Record<string, string>
  onToggleMineOnly: () => void
  onAskSettle: (d: DebtLine) => void
  onAskTear: (e: Expense) => void
}

export default function BillsVerse(p: Props) {
  return (
    <section className="verse" key="bills">
      <h2 className="seclabel">{p.mineOnly ? `${first(p.me)}'s fridge` : 'the whole fridge'}</h2>
      <div className="whos-tools">
        <button onClick={p.onToggleMineOnly}>{p.mineOnly ? 'show everyone' : 'just mine'}</button>
      </div>
      <div className="ious">
        {p.debts.length === 0 && <div className="empty">{p.mineOnly ? 'you owe nobody, nobody owes you. clean.' : 'nobody owes anybody. suspiciously peaceful.'}</div>}
        {p.debts.map((d, i) => (
          <div className="iou" key={i}>
            <span className="iou-text">{first(d.from)} owes {first(d.to)} <b>{inr(d.amount)}</b></span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
              {p.upi[d.to] && d.from === p.me && <a className="paylink" href={payLink(p.upi, d.to, d.amount)} onClick={() => p.onAskSettle(d)}>pay</a>}
              <button className="stampbtn" onClick={() => p.onAskSettle(d)}>sorted</button>
            </span>
          </div>
        ))}
      </div>
      <section className="feed">
        {p.expenses.length === 0 && <div className="empty">{p.mineOnly ? 'nothing with your name on it. go make a memory.' : 'nothing here yet. first chai, first fuel — someone\u2019s buying.'}</div>}
        {p.expenses.map((e) => (
          <Ticket key={e.id} e={e} me={p.me} onAskTear={p.onAskTear} />
        ))}
      </section>
    </section>
  )
}

function Ticket({ e, me, onAskTear }: { e: Expense; me: string; onAskTear: (e: Expense) => void }) {
  const orig = Object.entries(e.breakdown).filter(([id]) => id !== e.paidBy).reduce((a, [, v]) => a + v, 0)
  const left = Object.values(e.remaining ?? {}).reduce((a, v) => a + v, 0)
  const paid = Math.round((orig - left) * 100) / 100
  return (
    <article className="stub-ticket">
      <div className="main">
        <h3>{e.title}</h3>
        <div className="paidline">
          <span className="paidstamp" style={{ background: crewById(e.paidBy).color }}>{first(e.paidBy)} paid</span>
          {e.split === 'equal' ? `split ${e.involved.length === 6 ? 'between everyone' : 'between ' + e.involved.map(first).join(', ')}`
            : e.split === 'percent' ? 'by percent' : 'exact bits'} · {new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </div>
        <div className="parts">
          {Object.entries(e.remaining ?? e.breakdown).filter(([, v]) => v > 0.005).map(([id, v]) => (
            <span key={id} className={'part' + (id === me ? ' me' : '')}>{first(id)} {inr(v)}</span>
          ))}
        </div>
        {paid > 0.005 && <div className="paidline">₹{Math.round(paid)} already paid on this</div>}
        {e.rounded && <div className="paidline">incl. ₹1 round-off — the odd paise went to the last head</div>}
      </div>
      <div className="stub">
        <span className="amt">{inr(e.amount)}</span>
        <button className="tear" onClick={() => onAskTear(e)}>tear off</button>
      </div>
    </article>
  )
}
