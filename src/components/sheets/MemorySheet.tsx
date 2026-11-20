// Pin-a-go-to sheet. Owns its draft; closing without pinning discards it.
import { useState } from 'react'
import { WALL_COLORS } from '../../crew'
import { first } from '../../lib/format'
import { api } from '../../api'
import { buzz } from '../../feel'

type Props = {
  me: string
  onClose: () => void
  onSaved: () => void
  onErr: (msg: string) => void
}

export default function MemorySheet({ me, onClose, onSaved, onErr }: Props) {
  const [text, setText] = useState('')
  const [color, setColor] = useState(WALL_COLORS[0])

  async function submit() {
    if (!text.trim()) { onErr('write something first, even one line'); return }
    try {
      await api.pin({ author: me, text: text.trim(), color })
      onClose(); onSaved()
      buzz('go')
    } catch (e) { buzz('nope'); onErr(e instanceof Error ? e.message : 'did not stick, try again') }
  }

  return (
    <>
      <h2>pin it before you forget</h2>
      <label className="f">the memory<textarea className="t" value={text} onChange={(e) => setText(e.target.value)} placeholder="rushi tried to pay with exact change again…" maxLength={280} /></label>
      <label className="f">pick a sticky</label>
      <div className="swatches">
        {WALL_COLORS.map((c) => (
          <button key={c} aria-pressed={color === c} style={{ background: c }} aria-label={c} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="saverow">
        <button className="cancel" onClick={onClose}>nah</button>
        <button className="save" onClick={submit}>pin it — {first(me)}</button>
      </div>
    </>
  )
}
