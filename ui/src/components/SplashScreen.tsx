import { useEffect, useState, useRef } from 'react'

// ── Stage definitions ─────────────────────────────────────────────────────────

type StageStatus = 'pending' | 'running' | 'ok' | 'warn'

interface Stage {
  label:    string
  check?:   () => Promise<void>
  ms?:      number           // fixed delay when no check
}

const STAGES: Stage[] = [
  { label: 'Initializing Garuda runtime',         ms: 500 },
  { label: 'Connecting to control plane',
    check: () => fetch('/api/config').then(r => { if (!r.ok) throw new Error() }) },
  { label: 'Loading fleet configuration',          ms: 600 },
  { label: 'Verifying service registry',
    check: () => fetch('/api/status').then(r => { if (!r.ok) throw new Error() }) },
  { label: 'Calibrating geospatial index',         ms: 700 },
  { label: 'Establishing terminal bus',            ms: 400 },
  { label: 'System ready',                         ms: 500 },
]

// ── Background node network ───────────────────────────────────────────────────

const NODES = [
  { x: 12,  y: 18 }, { x: 28, y: 8  }, { x: 45, y: 22 },
  { x: 62,  y: 12 }, { x: 78, y: 25 }, { x: 88, y: 14 },
  { x: 18,  y: 68 }, { x: 35, y: 78 }, { x: 52, y: 65 },
  { x: 68,  y: 72 }, { x: 82, y: 62 }, { x: 92, y: 75 },
  { x: 8,   y: 42 }, { x: 95, y: 45 },
]

const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
  [6, 7], [7, 8], [8, 9], [9, 10], [10, 11],
  [0, 6], [2, 8], [4, 10], [12, 0], [12, 6],
  [5, 13], [11, 13],
]

function NodeNetwork() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18 }}
    >
      <defs>
        <linearGradient id="edge-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor="#7fa4bd" stopOpacity="0" />
          <stop offset="50%"  stopColor="#22d3ee" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7fa4bd" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Edges */}
      {EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={NODES[a].x} y1={NODES[a].y}
          x2={NODES[b].x} y2={NODES[b].y}
          stroke="rgba(127,164,189,0.3)"
          strokeWidth="0.2"
          style={{
            animation: `edge-fade 3s ease-in-out ${i * 0.18}s infinite alternate`,
          }}
        />
      ))}

      {/* Nodes */}
      {NODES.map((n, i) => (
        <g key={i}>
          <circle
            cx={n.x} cy={n.y} r="0.8"
            fill="rgba(34,211,238,0.7)"
            style={{ animation: `node-pulse 2.4s ease-in-out ${i * 0.22}s infinite` }}
          />
          <circle
            cx={n.x} cy={n.y} r="2.5"
            fill="none"
            stroke="rgba(34,211,238,0.2)"
            strokeWidth="0.3"
            style={{ animation: `ring-expand 2.4s ease-out ${i * 0.22}s infinite` }}
          />
        </g>
      ))}
    </svg>
  )
}

// ── Main splash component ─────────────────────────────────────────────────────

interface Props {
  onComplete: () => void
}

export default function SplashScreen({ onComplete }: Props) {
  const [progress,  setProgress]  = useState(0)
  const [stageLog,  setStageLog]  = useState<{ label: string; status: StageStatus }[]>([])
  const [exiting,     setExiting]     = useState(false)
  const [scanY,       setScanY]       = useState(-4)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  // Scan line animation
  useEffect(() => {
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts
      const elapsed = (ts - startRef.current) % 6000
      setScanY(-4 + (elapsed / 6000) * 110)
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Run stages
  useEffect(() => {
    let cancelled = false
    const perStage = 100 / STAGES.length

    async function run() {
      for (let i = 0; i < STAGES.length; i++) {
        if (cancelled) return
        const stage = STAGES[i]

        setStageLog(prev => [...prev, { label: stage.label, status: 'running' }])

        let ok = true
        if (stage.check) {
          try   { await stage.check() }
          catch { ok = false }
        } else {
          await sleep(stage.ms ?? 400)
        }

        if (cancelled) return
        setStageLog(prev => prev.map((s, j) =>
          j === i ? { ...s, status: ok ? 'ok' : 'warn' } : s
        ))
        setProgress(Math.round((i + 1) * perStage))

        // brief pause between stages so the log is readable
        await sleep(120)
      }

      if (cancelled) return
      await sleep(600)
      setExiting(true)
      await sleep(700)
      if (!cancelled) onComplete()
    }

    run()
    return () => { cancelled = true }
  }, [onComplete])

  const visibleLog = stageLog.slice(-5)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(180deg,#0a1117 0%,#091117 52%,#070d12 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: exiting ? 0 : 1,
      transition: 'opacity 0.7s ease-in-out',
      overflow: 'hidden',
    }}>

      {/* Technical grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(147,161,173,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(147,161,173,0.06) 1px, transparent 1px)`,
        backgroundSize: '56px 56px',
      }} />

      {/* Node network */}
      <NodeNetwork />

      {/* Top radial glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '50vh', pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.06) 0%, transparent 70%)',
      }} />

      {/* Scan line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, pointerEvents: 'none',
        top: `${scanY}%`, height: '1px',
        background: 'linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.18) 20%, rgba(34,211,238,0.32) 50%, rgba(34,211,238,0.18) 80%, transparent 100%)',
        boxShadow: '0 0 12px rgba(34,211,238,0.15)',
      }} />

      {/* ── Centre content ─────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '480px', padding: '0 32px', textAlign: 'center' }}>

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '16px',
            border: '1px solid rgba(34,211,238,0.22)',
            background: 'rgba(34,211,238,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px rgba(34,211,238,0.10), inset 0 0 20px rgba(34,211,238,0.04)',
            animation: 'logo-glow 3s ease-in-out infinite',
          }}>
            <img src="/logo.png" alt="GoatAI" style={{ width: '52px', height: '52px', objectFit: 'contain', borderRadius: '8px' }} />
          </div>
        </div>

        {/* Eyebrow */}
        <div style={{
          fontFamily: 'var(--ff-mono)', fontSize: '10px', letterSpacing: '0.32em',
          textTransform: 'uppercase', color: 'var(--electric)', marginBottom: '12px',
          animation: 'fade-up 0.6s ease-out 0.2s both',
        }}>
          GoatAI · Mobility Intelligence
        </div>

        {/* Main title */}
        <div style={{
          fontFamily: 'var(--ff-display)', fontSize: '64px', fontWeight: 700,
          letterSpacing: '-0.04em', lineHeight: 1,
          color: 'var(--foreground-strong)',
          animation: 'fade-up 0.7s ease-out 0.35s both',
          textShadow: '0 0 60px rgba(34,211,238,0.12)',
        }}>
          Garuda
        </div>

        {/* Divider */}
        <div style={{
          margin: '16px auto',
          height: '1px', width: '120px',
          background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.4), transparent)',
          animation: 'fade-in 0.6s ease-out 0.6s both',
        }} />

        {/* Subtitle */}
        <div style={{
          fontFamily: 'var(--ff-mono)', fontSize: '11px', letterSpacing: '0.28em',
          textTransform: 'uppercase', color: 'var(--muted-strong)',
          animation: 'fade-up 0.6s ease-out 0.55s both',
          marginBottom: '48px',
        }}>
          Fleet Command &amp; Intelligence Platform
        </div>

        {/* Stage log */}
        <div style={{
          minHeight: '110px', marginBottom: '24px', textAlign: 'left',
          animation: 'fade-in 0.5s ease-out 0.8s both',
        }}>
          {visibleLog.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '4px 0',
              opacity: i === visibleLog.length - 1 ? 1 : 0.45,
              transition: 'opacity 0.3s',
            }}>
              <span style={{
                flexShrink: 0, width: '6px', height: '6px', borderRadius: '50%',
                background: s.status === 'ok'      ? 'var(--status-ok)'
                          : s.status === 'warn'    ? 'var(--status-warn)'
                          : s.status === 'running' ? 'var(--electric)'
                          : 'var(--muted)',
                boxShadow: s.status === 'running' ? '0 0 6px var(--electric)' : 'none',
                animation:  s.status === 'running' ? 'node-pulse 1s ease-in-out infinite' : 'none',
              }} />
              <span style={{
                fontFamily: 'var(--ff-mono)', fontSize: '11px',
                color: s.status === 'ok'   ? 'var(--muted-strong)'
                     : s.status === 'warn' ? 'var(--status-warn)'
                     : 'var(--foreground)',
              }}>
                {s.label}
                {s.status === 'ok'      && <span style={{ color: 'var(--status-ok)',   marginLeft: 8 }}>✓</span>}
                {s.status === 'warn'    && <span style={{ color: 'var(--status-warn)', marginLeft: 8 }}>⚠ unavailable</span>}
                {s.status === 'running' && <span style={{ color: 'var(--electric)',    marginLeft: 8, animation: 'data-tick 0.8s ease-in-out infinite' }}>…</span>}
              </span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ animation: 'fade-in 0.5s ease-out 0.9s both' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: '8px',
          }}>
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.1em' }}>
              INITIALIZING
            </span>
            <span style={{
              fontFamily: 'var(--ff-mono)', fontSize: '13px', fontWeight: 500,
              color: 'var(--electric)',
              textShadow: '0 0 12px rgba(34,211,238,0.4)',
            }}>
              {progress}%
            </span>
          </div>

          {/* Track */}
          <div style={{
            height: '2px', borderRadius: '9999px',
            background: 'rgba(127,164,189,0.12)',
            overflow: 'hidden',
            boxShadow: 'inset 0 0 4px rgba(0,0,0,0.3)',
          }}>
            {/* Fill */}
            <div style={{
              height: '100%', borderRadius: '9999px',
              background: 'linear-gradient(90deg, #7fa4bd, #22d3ee)',
              width: `${progress}%`,
              transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1)',
              boxShadow: '0 0 8px rgba(34,211,238,0.5)',
            }} />
          </div>
        </div>

      </div>

      {/* Bottom label */}
      <div style={{
        position: 'absolute', bottom: '28px', left: 0, right: 0, textAlign: 'center',
        fontFamily: 'var(--ff-mono)', fontSize: '10px', color: 'var(--muted)',
        letterSpacing: '0.18em', animation: 'fade-in 0.5s ease-out 1s both',
      }}>
        goatai.io · fleet intelligence
      </div>

      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes node-pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%     { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes ring-expand {
          0%   { r: 0; opacity: 0.6; }
          100% { r: 3.5; opacity: 0; }
        }
        @keyframes edge-fade {
          from { opacity: 0.2; }
          to   { opacity: 0.6; }
        }
        @keyframes logo-glow {
          0%,100% { box-shadow: 0 0 32px rgba(34,211,238,0.10), inset 0 0 20px rgba(34,211,238,0.04); }
          50%     { box-shadow: 0 0 48px rgba(34,211,238,0.20), inset 0 0 28px rgba(34,211,238,0.08); }
        }
        @keyframes data-tick {
          0%,100% { opacity: 0.4; }
          50%     { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}
