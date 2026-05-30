import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  Bell,
  Boxes,
  CirclePlay,
  Command,
  Gauge,
  MapPinned,
  MonitorDot,
  RadioTower,
  ShieldAlert,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useRecentAlarms, useServices, useTerminals } from '../api/hooks'

const NAV = [
  { to: '/', label: 'Command', short: 'CMD', icon: Gauge, group: 'Overview' },
  { to: '/vehicles', label: 'Monitor', short: 'MON', icon: MonitorDot, group: 'Operations' },
  { to: '/alarms', label: 'Safety', short: 'SAFE', icon: ShieldAlert, group: 'Operations' },
  { to: '/media', label: 'Media', short: 'VID', icon: CirclePlay, group: 'Operations' },
  { to: '/management', label: 'Management', short: 'MGT', icon: Boxes, group: 'Management' },
  { to: '/services', label: 'Services', short: 'SVC', icon: Wrench, group: 'Runtime' },
]

const TABS: Record<string, { label: string; hint: string; icon: typeof Activity }> = {
  '/': { label: 'Enterprise Kanban', hint: 'Fleet command summary', icon: Gauge },
  '/vehicles': { label: 'Live Monitor', hint: 'Vehicles, sessions, map', icon: MapPinned },
  '/alarms': { label: 'Risk Workbench', hint: 'Alarm history and clips', icon: ShieldAlert },
  '/media': { label: 'Media Console', hint: 'JT1078 stream control', icon: CirclePlay },
  '/management': { label: 'Management Center', hint: '', icon: Boxes },
  '/services': { label: 'Service Orchestrator', hint: 'Stack control and logs', icon: Wrench },
}

function routeKey(pathname: string) {
  if (pathname === '/') return '/'
  const match = NAV.find(item => item.to !== '/' && pathname.startsWith(item.to))
  return match?.to ?? '/'
}

export default function Layout() {
  const location = useLocation()
  const key = routeKey(location.pathname)
  const activeTab = TABS[key]
  const [now, setNow] = useState(() => new Date())
  const { data: terminals = [] } = useTerminals()
  const { data: services = [] } = useServices()
  const { data: alarms = [] } = useRecentAlarms(100)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const running = services.filter(service => service.running).length
  const unhealthy = services.length - running
  const activeStreams = useMemo(
    () => services.some(service => service.id === 'jt808-rtvs' && service.running),
    [services],
  )

  return (
    <div className="garuda-shell">
      <aside className="garuda-rail">
        <div className="garuda-brand">
          <img src="/logo.png" alt="GoatAI" className="h-8 w-8 object-contain" />
          <div>
            <div className="font-display text-[15px] font-semibold" style={{ color: 'var(--foreground-strong)' }}>
              Garuda
            </div>
            <div className="font-mono text-[9px] uppercase" style={{ color: 'var(--muted)' }}>
              Fleet Command
            </div>
          </div>
        </div>

        <nav className="garuda-nav" aria-label="Primary">
          {NAV.map(item => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `garuda-nav-item ${isActive ? 'active' : ''}`}
                aria-label={item.label}
                title={item.label}
                data-tooltip={`${item.label} · ${item.group}`}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span className="sr-only">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="garuda-rail-footer">
          <StatusDot tone={unhealthy === 0 && services.length > 0 ? 'ok' : running > 0 ? 'warn' : 'muted'} />
          <div>
            <div className="font-mono text-[10px]" style={{ color: 'var(--muted-strong)' }}>
              {running}/{services.length} services
            </div>
            <div className="font-mono text-[9px]" style={{ color: 'var(--muted)' }}>
              localhost:8080
            </div>
          </div>
        </div>
      </aside>

      <section className="garuda-main">
        <header className="garuda-topbar">
          <div className="garuda-context">
            <div className="garuda-context-icon">
              <Command size={18} strokeWidth={1.8} />
            </div>
            <div>
              <div className="eyebrow text-[9px]">Garuda Fleet Command</div>
              <div className="font-display text-lg font-semibold" style={{ color: 'var(--foreground-strong)' }}>
                {activeTab.label}
              </div>
            </div>
          </div>

          <div className="garuda-status-strip">
            <TopMetric icon={RadioTower} label="Terminals" value={String(terminals.length)} tone={terminals.length > 0 ? 'ok' : 'muted'} />
            <TopMetric icon={Bell} label="Alarms" value={String(alarms.length)} tone={alarms.length > 0 ? 'warn' : 'muted'} />
            <TopMetric icon={Activity} label="RTVS" value={activeStreams ? 'live' : 'idle'} tone={activeStreams ? 'ok' : 'muted'} />
            <TopMetric icon={SlidersHorizontal} label="Services" value={`${running}/${services.length}`} tone={unhealthy === 0 && services.length > 0 ? 'ok' : 'warn'} />
            <div className="garuda-clock">
              <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
                {now.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
              </div>
              <div className="font-mono text-[12px]" style={{ color: 'var(--foreground-strong)' }}>
                {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </header>

          <div className="garuda-worktabs">
          {NAV.map(item => {
            const tab = TABS[item.to]
            const Icon = tab.icon
            const selected = item.to === key
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={`garuda-worktab ${selected ? 'active' : ''}`}
                title={`${tab.label} · ${tab.hint}`}
              >
                <Icon size={14} strokeWidth={1.8} />
                <span>{tab.label}</span>
              </NavLink>
            )
          })}
          {activeTab.hint && <div className="garuda-worktab-hint">{activeTab.hint}</div>}
        </div>

        <main className="garuda-content">
          <Outlet />
        </main>
      </section>
    </div>
  )
}

function StatusDot({ tone }: { tone: 'ok' | 'warn' | 'muted' }) {
  const color = tone === 'ok' ? 'var(--status-ok)' : tone === 'warn' ? 'var(--status-warn)' : 'var(--muted)'
  return (
    <span className="status-dot" style={{ color }}>
      <span className="status-dot-inner" style={{ background: color }} />
    </span>
  )
}

function TopMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity
  label: string
  value: string
  tone: 'ok' | 'warn' | 'muted'
}) {
  return (
    <div className={`garuda-topmetric ${tone}`}>
      <Icon size={15} strokeWidth={1.8} />
      <div>
        <div className="font-mono text-[9px] uppercase">{label}</div>
        <div className="font-mono text-[12px]">{value}</div>
      </div>
    </div>
  )
}
