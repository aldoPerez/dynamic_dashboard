import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { useBranches } from './hooks/useBranches'
import { useLayout } from './hooks/useLayout'
import { useWidgetData, useLiveData } from './hooks/useWidgetData'
import WidgetRenderer from './components/widgets/WidgetRenderer'
import './styles.css'

const PERIODS = [
  { label: 'Hoy', days: 0 },
  { label: '7d', days: 7 },
  { label: '15d', days: 15 },
  { label: '30d', days: 30 },
]

function todayStr() { return new Date().toISOString().slice(0, 10) }
function addDays(str, d) { const dt = new Date(str); dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10) }

const WIDTH_COLS = { '1/3': 'widget-col-2', '1/2': 'widget-col-3', '2/3': 'widget-col-4', 'full': 'widget-col-6' }

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>
}

function AppInner() {
  const { user, loading, signOut } = useAuth()
  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1117', color: '#8892a4' }}>Cargando...</div>
  if (!user) return <Login />
  return <Dashboard onSignOut={signOut} userEmail={user.email} />
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true); setError(null)
    const { error } = await signIn(email, password)
    if (error) setError('Credenciales incorrectas')
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">📊</div>
          <div><h1>Dashboard</h1><p>Sistema de Ventas</p></div>
        </div>
        <div className="login-field">
          <label>Correo</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="gerente@empresa.com" />
        </div>
        <div className="login-field">
          <label>Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="••••••••" />
        </div>
        {error && <p className="login-error">⚠️ {error}</p>}
        <button className="login-btn" onClick={handleLogin} disabled={loading || !email}>
          {loading ? 'Verificando...' : 'Ingresar'}
        </button>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ onSignOut, userEmail }) {
  const { branches, loading: loadingBranches } = useBranches()
  const [selectedBranch, setSelectedBranch] = useState('')
  const [period, setPeriod] = useState(0)
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo, setDateTo] = useState(todayStr())
  const [custom, setCustom] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { widgets, loading: loadingLayout } = useLayout(selectedBranch)
  const { data, loading: loadingData, error, refetch } = useWidgetData({ branchId: selectedBranch, widgets, dateFrom, dateTo })
  const { liveData } = useLiveData(selectedBranch)

  // Auto-seleccionar primera sucursal
  useEffect(() => {
    if (branches.length > 0 && !selectedBranch) setSelectedBranch(branches[0].id)
  }, [branches])

  // Cambio de período
  useEffect(() => {
    if (custom) return
    const today = todayStr()
    if (period === 0) { setDateFrom(today); setDateTo(today) }
    else { setDateFrom(addDays(today, -PERIODS[period].days)); setDateTo(today) }
  }, [period, custom])

  const branch = branches.find(b => b.id === selectedBranch)
  const loading = loadingBranches || loadingLayout

  return (
    <div className="app">
      {/* Overlay mobile */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">📊</div>
          <div>
            <div className="sidebar-brand-text">{branch?.name ?? 'Dashboard'}</div>
            <div className="sidebar-brand-sub">Sistema de Ventas</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">Sucursales</div>
          {branches.map(b => (
            <div key={b.id}
              className={`nav-item ${selectedBranch === b.id ? 'active' : ''}`}
              onClick={() => { setSelectedBranch(b.id); setSidebarOpen(false) }}
            >
              <span className="nav-icon">🏪</span>
              <span style={{ flex: 1 }}>{b.name}</span>
            </div>
          ))}
          {branches.length === 0 && !loadingBranches && (
            <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-3)' }}>Sin sucursales asignadas</div>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">{userEmail}</div>
          <button className="btn-logout" onClick={onSignOut}>Cerrar sesión</button>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        {/* Topbar */}
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="menu-btn" onClick={() => setSidebarOpen(v => !v)}>☰</button>
            <div className="topbar-left">
              <h1>Dashboard</h1>
              <p>{branch?.name ?? 'Selecciona una sucursal'}</p>
            </div>
          </div>
          <div className="topbar-controls">
            {/* Períodos */}
            <div className="period-tabs">
              {PERIODS.map((p, i) => (
                <button key={p.label} className={`period-tab ${!custom && period === i ? 'active' : ''}`}
                  onClick={() => { setPeriod(i); setCustom(false) }}>
                  {p.label}
                </button>
              ))}
            </div>
            {/* Fechas */}
            <input type="date" className="date-input" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setCustom(true) }} />
            <input type="date" className="date-input" value={dateTo} onChange={e => { setDateTo(e.target.value); setCustom(true) }} />
            {/* Refresh */}
            <button className="btn-refresh" onClick={refetch} disabled={loadingData}>
              {loadingData ? <><span className="spinner" style={{ width: 13, height: 13, borderTopColor: '#fff' }} /> Cargando</> : '↻'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="content">
          {!selectedBranch ? (
            <div className="no-branch">
              <span className="no-branch-icon">🏪</span>
              <p>Selecciona una sucursal</p>
            </div>
          ) : loading ? (
            <SkeletonGrid />
          ) : widgets.length === 0 ? (
            <div className="no-branch">
              <span className="no-branch-icon">📊</span>
              <p>Esta sucursal no tiene widgets configurados</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Configúralos desde el panel admin</p>
            </div>
          ) : (
            <>
              {error && <div className="error-banner">⚠️ {error}</div>}
              <div className="dashboard-grid">
                {(widgets ?? []).filter(Boolean).map(layout => {
                  console.log(layout);
                  if (!layout?.dashboard_widgets) return null
                  const w = layout.dashboard_widgets
                  if (!w) return null
                  console.log(w);
                  const colClass = WIDTH_COLS[w.width] ?? 'widget-col-3'
                  return (
                    <div key={layout.id} className={`widget-card ${colClass}`}>
                      <div className="widget-card-header">
                        <span className="widget-card-title">{w.title}</span>
                        {loadingData && <span className="spinner" />}
                      </div>
                      <div className="widget-card-body">
                        {loadingData
                          ? <div className="widget-skeleton" style={{ height: 120 }} />
                          : <WidgetRenderer widget={w} data={data} liveData={liveData} />
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="dashboard-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={`widget-card ${i % 3 === 0 ? 'widget-col-2' : i % 3 === 1 ? 'widget-col-3' : 'widget-col-3'}`}>
          <div className="widget-card-header"><div className="widget-skeleton" style={{ height: 16, width: 120, borderRadius: 4 }} /></div>
          <div className="widget-card-body"><div className="widget-skeleton" style={{ height: 140 }} /></div>
        </div>
      ))}
    </div>
  )
}
