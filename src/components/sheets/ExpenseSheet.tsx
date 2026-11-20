// New-bill sheet. Owns its draft — typing here touches nothing behind it.
// Fresh draft on every open; closing without sticking discards it.
import { useState } from 'react'
import { CREW } from '../../crew'
import { first, inr } from '../../lib/format'
import { api, type Split } from '../../api'
import { buzz } from '../../feel'

const SEGMENTS: { id: Split; label: string }[] = [
  { id: 'equal', label: 'even steven' },
  { id: 'custom', label: 'exact ₹' },
  { id: 'percent', label: 'by %' },
]

type Props = {
  me: string
  onClose: () => void
  onSaved: () => void
  onErr: (msg: string) => void
}

export default function ExpenseSheet({ me, onClose, onSaved, onErr }: Props) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [split, setSplit] = useState<Split>('equal')
  const [involved, setInvolved] = useState<string[]>([])
  const [shares, setShares] = useState<Record<string, string>>({})

  const amt = Math.round(Number(amount) * 100) / 100 || 0
  const sumShares = Object.values(shares).reduce((s, v) => s + (Number(v) || 0), 0)

  const toggleInvolved = (id: string) =>
    setInvolved((inv) => (inv.includes(id) ? inv.filter((x) => x !== id) : [...inv, id]))

  async function submit() {
    if (!title.trim() || !(amt > 0)) { onErr('give it a name and a number, even a rough one'); return }
    if (!involved.length) { onErr("tap who's in — even one counts"); return }
    const bits: Record<string, number> = {}
    if (split !== 'equal') {
      for (const id of involved) bits[id] = Number(shares[id] || 0)
      const sum = Object.values(bits).reduce((a, b) => a + b, 0)
      const need = split === 'percent' ? 100 : amt
      const unit = split === 'percent' ? '%' : '₹'
      if (Math.abs(sum - need) > 0.01) { onErr(`those bits add to ${unit}${sum}, need ${unit}${need}`); return }
    }
    try {
      await api.add({ title: title.trim(), amount: amt, paidBy: me, split, involved, shares: bits })
      onClose(); onSaved()
      buzz('go')
    } catch (e) { buzz('nope'); onErr(e instanceof Error ? e.message : 'did not stick, try again') }
  }

  return (
    <>
      <h2>new bill on the fridge</h2>
      <label className="f">what was it<input className="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="fuel after chandigarh" maxLength={60} /></label>
      <label className="f">how much<input className="t" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1200" /></label>
      <p className="livecalc">paid by you · {first(me)} — sticking a bill someone else paid? tap their face first</p>
      <label className="f">who was in on it</label>
      <div className="whos-tools">
        <button onClick={() => setInvolved(CREW.map((c) => c.id))}>all six</button>
        <button onClick={() => setInvolved([])}>clear</button>
      </div>
      <div className="whos">
        {CREW.map((c) => (
          <button key={c.id} className="who" aria-pressed={involved.includes(c.id)} onClick={() => toggleInvolved(c.id)}>
            <span className="phiz" style={{ background: c.color }}>{c.tag}</span><br />{first(c.id)}
          </button>
        ))}
      </div>
      <div className="seg">
        {SEGMENTS.map((s) => (
          <button key={s.id} aria-pressed={split === s.id} onClick={() => setSplit(s.id)}>{s.label}</button>
        ))}
      </div>
      {split !== 'equal' && (
        <div className="shares">
          {involved.map((id) => (
            <label key={id}>{first(id)} {split === 'percent' ? '%' : '₹'}
              <input inputMode="decimal" value={shares[id] || ''} placeholder="0"
                onChange={(e) => setShares({ ...shares, [id]: e.target.value })} />
            </label>
          ))}
        </div>
      )}
      {split === 'equal' && amt > 0 && (
        involved.length
          ? <p className="livecalc">≈ {inr(Math.round(amt / involved.length))} each for the {involved.length} of you in on it</p>
          : <p className="livecalc">tap who's in first, then watch the math</p>
      )}
      {split !== 'equal' && (
        <p className="livecalc">bits so far: {split === 'percent' ? `${sumShares}% of 100%` : `${inr(sumShares)} of ${inr(amt)}`}</p>
      )}
      <div className="saverow">
        <button className="cancel" onClick={onClose}>nah</button>
        <button className="save" onClick={submit}>stick it up</button>
      </div>
    </>
  )
}
