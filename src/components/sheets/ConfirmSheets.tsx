// Confirm sheets: plain presentational confirmations, no drafts.
// Back closes them the same as tapping cancel — App owns the outcomes.
import { first, inr } from '../../lib/format'
import type { Expense, Settle } from '../../api'

export function ConfirmSettleSheet({ pending, onCancel, onConfirm }: {
  pending: { from: string; to: string; amount: number } | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <>
      <h2>mark sorted?</h2>
      <p className="hintline">{pending ? `${first(pending.from)} → ${first(pending.to)} · ${inr(pending.amount)}` : ''} — tap “yes, paid” only if the money really moved.</p>
      <div className="saverow">
        <button className="cancel" onClick={onCancel}>cancel</button>
        <button className="save" onClick={onConfirm}>yes, paid</button>
      </div>
    </>
  )
}

export function ConfirmTearSheet({ pending, related, onKeep, onTearBill, onTearAll }: {
  pending: Expense | null
  related: Settle[]
  onKeep: () => void
  onTearBill: () => void
  onTearAll: () => void
}) {
  return (
    <>
      <h2>tear it off?</h2>
      <p className="hintline">{pending ? `“${pending.title}” · ${inr(pending.amount)} — gone for everyone, no undo.` : ''}</p>
      {related.length > 0 && (
        <p className="hintline">{related.length} payment{related.length === 1 ? '' : 's'} point{related.length === 1 ? 's' : ''} at this bill ({related.map((s) => `${first(s.from)} ₹${Math.round(s.amount)}`).join(', ')}) — take {related.length === 1 ? 'it' : 'them'} along, or leave {related.length === 1 ? 'it' : 'them'} standing.</p>
      )}
      <div className="saverow">
        <button className="cancel" onClick={onKeep}>keep it</button>
        <button className="cancel" onClick={onTearBill}>bill only</button>
        {related.length > 0 && <button className="save" onClick={onTearAll}>bill + ₹{Math.round(related.reduce((s, x) => s + x.amount, 0))}</button>}
        {related.length === 0 && <button className="save" onClick={onTearBill}>tear it</button>}
      </div>
    </>
  )
}
