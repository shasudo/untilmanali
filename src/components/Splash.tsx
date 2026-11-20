// 6–7 splash. Fresh launch only — never on refresh. One tap opens.
export default function Splash({ onClose }: { onClose: () => void }) {
  return (
    <div className="ss" role="button" aria-label="six seven — tap to stop" onClick={onClose}>
      <div className="ss-word"><span style={{ color: '#d8ff3e' }}>SIX</span><span style={{ color: '#ff5c1f' }}>SEVEN</span></div>
      <div className="ss-plank"><span className="ss-puck l">6</span><span className="ss-puck r">7</span></div>
      <div className="ss-base" />
      <p className="hintline">both palms up. you know the move. tap to open.</p>
    </div>
  )
}
