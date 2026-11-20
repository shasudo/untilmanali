// First-run identity gate. One tap — the phone remembers after this.
import { CREW } from '../crew'
import { first } from '../lib/format'

export default function Gate({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="gate" role="dialog" aria-label="Who are you">
      <div className="gatecard">
        <h1 className="marker-title">who <u>are</u> you?</h1>
        <p className="hintline">one tap — this phone remembers you after this.</p>
        <div className="whos">
          {CREW.map((c) => (
            <button key={c.id} className="who" aria-pressed={false} onClick={() => onPick(c.id)}>
              <span className="phiz" style={{ background: c.color }}>{c.tag}</span><br />{first(c.id)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
