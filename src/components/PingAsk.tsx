// One friendly ask per launch: pings on, once the splash is gone.
export default function PingAsk({ onLater, onSwitchOn }: { onLater: () => void; onSwitchOn: () => void }) {
  return (
    <>
      <div className="scrim" style={{ zIndex: 39 }} onClick={onLater} />
      <div className="pop" role="dialog" aria-label="Switch pings on">
        <h2>hear the fridge buzz?</h2>
        <p>switch pings on and your phone shouts when anyone sticks a bill, sorts one, or pins a go-to.</p>
        <div className="saverow">
          <button className="cancel" onClick={onLater}>later</button>
          <button className="save" onClick={onSwitchOn}>switch on</button>
        </div>
      </div>
    </>
  )
}
