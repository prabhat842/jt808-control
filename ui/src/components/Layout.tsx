import { NavLink, Outlet } from 'react-router-dom'
import { useTerminals, useServices } from '../api/hooks'

const NAV = [
  { to: '/',          label: 'Fleet',    icon: '◈' },
  { to: '/vehicles',  label: 'Vehicles', icon: '⬡' },
  { to: '/alarms',    label: 'Alarms',   icon: '◉' },
  { to: '/media',     label: 'Media',    icon: '▶' },
  { to: '/services',  label: 'Services', icon: '⚙' },
]

const active = {
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '7px 12px', borderRadius: 'var(--radius-sm)',
  fontSize: '13px', fontWeight: 500, textDecoration: 'none',
  background: 'var(--electric-soft)', border: '1px solid var(--electric-border)',
  color: 'var(--electric)',
} as React.CSSProperties

const inactive = {
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '7px 12px', borderRadius: 'var(--radius-sm)',
  fontSize: '13px', fontWeight: 400, textDecoration: 'none',
  background: 'transparent', border: '1px solid transparent',
  color: 'var(--muted-strong)',
} as React.CSSProperties

export default function Layout() {
  const { data: terminals } = useTerminals()
  const { data: services  } = useServices()
  const online  = terminals?.length ?? 0
  const running = services?.filter(s => s.running).length ?? 0
  const total   = services?.length ?? 0

  return (
    <div className="flex h-screen" style={{ background: 'var(--background)' }}>
      <aside className="w-56 flex-shrink-0 flex flex-col"
        style={{ background: 'rgba(9,17,23,0.95)', borderRight: '1px solid var(--border)' }}>

        {/* Brand */}
        <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <img src="/logo.png" alt="GoatAI" className="h-7 w-auto object-contain" style={{ borderRadius: '6px' }} />
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.26em]" style={{ color: 'var(--muted)' }}>
            Fleet Command
          </div>
          <div className="flex flex-col gap-1 mt-2">
            <div className="flex items-center gap-1.5">
              <span className="status-dot">
                <span className="status-dot-inner"
                  style={{ background: online > 0 ? 'var(--status-ok)' : 'var(--muted)', color: online > 0 ? 'var(--status-ok)' : 'var(--muted)' }} />
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--muted-strong)' }}>
                {online} terminal{online !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="status-dot">
                <span className="status-dot-inner"
                  style={{ background: running > 0 ? 'var(--electric)' : 'var(--muted)', color: running > 0 ? 'var(--electric)' : 'var(--muted)' }} />
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--muted-strong)' }}>
                {running}/{total} services
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              style={({ isActive }) => isActive ? active : inactive}>
              <span style={{ fontSize: '12px', opacity: 0.7 }}>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 font-mono text-[10px]"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>
          goatai.io · fleet control
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
