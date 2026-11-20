// What’s-new sheet. Read-only for the crew; the dev key unlocks posting.
import { useState } from 'react'
import { api, type LogEntry } from '../../api'
import { buzz } from '../../feel'

const DEVKEY_KEY = 'untilmanali.devkey'

type Props = {
  entries: LogEntry[]
  onClose: () => void
  onPosted: () => void
  onErr: (msg: string) => void
}

export default function LogSheet({ entries, onClose, onPosted, onErr }: Props) {
  const [draft, setDraft] = useState('')
  const [devKey, setDevKey] = useState(() => localStorage.getItem(DEVKEY_KEY) || '')

  const unlockDev = () => {
    const k = window.prompt('dev key:')
    if (k && k.trim()) { localStorage.setItem(DEVKEY_KEY, k.trim()); setDevKey(k.trim()) }
  }

  async function submit() {
    if (!draft.trim()) { onErr('write the news first'); return }
    try {
      await api.addLog(draft.trim(), devKey || undefined)
      setDraft(''); onPosted()
      buzz('go')
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      if (m.includes('dev only')) {
        localStorage.removeItem(DEVKEY_KEY); setDevKey('')
        onErr('that dev key did not work')
      } else { buzz('nope'); onErr(m || 'did not stick, try again') }
    }
  }

  return (
    <>
      <h2>what’s new</h2>
      <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        {entries.length === 0 && <div className="empty">nothing yet. history starts here.</div>}
        {entries.map((e) => (
          <div className="logrow" key={e.id}>{e.text}<small>{new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small></div>
        ))}
      </div>
      {devKey ? (
        <>
          <label className="f">add a line<textarea className="t" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="pings now buzz for crossed-off go-tos…" maxLength={280} /></label>
          <div className="saverow">
            <button className="cancel" onClick={onClose}>close</button>
            <button className="save" onClick={submit}>post it</button>
          </div>
        </>
      ) : (
        <>
          <div className="whos-tools">
            <button onClick={unlockDev}>dev? add news</button>
          </div>
          <div className="saverow">
            <button className="cancel" onClick={onClose}>close</button>
          </div>
        </>
      )}
    </>
  )
}
