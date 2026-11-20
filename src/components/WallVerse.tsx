// Go-to verse: sticky notes. Tap to cross off, crossed ones sink down.
import { api, type Memory } from '../api'
import { first } from '../lib/format'
import { buzz } from '../feel'

type Props = {
  wall: Memory[]
  onChanged: () => void
  onPin: () => void
}

export default function WallVerse({ wall, onChanged, onPin }: Props) {
  const cross = async (m: Memory) => {
    buzz('tap')
    try { await api.cross(m.id, !m.done); onChanged() } catch { /* stays as-is */ }
  }
  const unpin = async (m: Memory) => {
    buzz('tap')
    try { await api.unpin(m.id); onChanged() } catch { /* stays as-is */ }
  }
  return (
    <section className="verse" key="wall">
      <h2 className="seclabel">the go-to list · {wall.filter((m) => !m.done).length} to go</h2>
      <section className="notes">
        {wall.map((m) => (
          <div className={'note' + (m.done ? ' done' : '')} key={m.id} style={{ background: m.color }}
            title={m.done ? 'tap to uncross' : 'tap to cross off'}
            onClick={() => cross(m)}>
            <button className="x" aria-label="unpin" onClick={(e) => { e.stopPropagation(); unpin(m) }}>×</button>
            <span className="notetext">{m.text}</span>
            <small>— {first(m.author)}</small>
          </div>
        ))}
        <button className="addnote" onClick={onPin}>+ pin a go-to…</button>
      </section>
      {wall.length === 0 && <p className="hintline" style={{ marginTop: 8 }}>first one writes itself: where were you when this pot started?</p>}
    </section>
  )
}
