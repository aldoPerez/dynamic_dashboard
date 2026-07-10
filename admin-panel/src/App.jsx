import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import BranchesPage        from './components/branches/BranchesPage'
import DataTypesPage        from './components/datatypes/DataTypesPage'
import ConnectionsPage      from './components/connections/ConnectionsPage'
import UsersPage            from './components/users/UsersPage'
import DashboardConfigPage  from './components/dashboard/DashboardConfigPage'
import './styles.css'

const NAV = [
  { to: '/branches',    icon: '🏪', label: 'Sucursales'    },
  { to: '/data-types',  icon: '📊', label: 'Tipos de dato' },
  { to: '/dashboard',   icon: '🖥️', label: 'Dashboard'     },
  { to: '/connections', icon: '🔌', label: 'Conexiones'    },
  { to: '/users',       icon: '👥', label: 'Usuarios'      },
]

export default function App() {
  return <AuthProvider><BrowserRouter><AppInner /></BrowserRouter></AuthProvider>
}

function AppInner() {
  const { user, profile, loading, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', color:'var(--text-2)' }}>
      Cargando...
    </div>
  )
  if (!user) return <Login />

  function closeSidebar() { setSidebarOpen(false) }

  return (
    <div className="app-layout">
      {/* Overlay mobile */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'sidebar-overlay--open' : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar-logo">
          <h2>⚡ Admin Panel</h2>
          <span>v1.0.0</span>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">Sistema</div>
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={closeSidebar}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">{profile?.full_name ?? user.email}</div>
          <div style={{ fontSize:11, textTransform:'capitalize', marginBottom:10, color:'var(--text-3)' }}>
            {profile?.role}
          </div>
          <button className="btn-secondary" style={{ width:'100%', fontSize:12 }} onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {/* Mobile topbar con hamburguesa */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <button className="menu-toggle" onClick={() => setSidebarOpen(v => !v)}>
            ☰
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            ⚡ Admin Panel
          </span>
        </div>

        <Routes>
          <Route path="/"            element={<Navigate to="/branches" replace />} />
          <Route path="/branches"    element={<BranchesPage />} />
          <Route path="/data-types"  element={<DataTypesPage />} />
          <Route path="/dashboard"   element={<DashboardConfigPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/users"       element={<UsersPage />} />
        </Routes>
      </main>
    </div>
  )
}

function Login() {
  const { signIn } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  async function handleLogin() {
    setLoading(true); setError(null)
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>⚡ Admin Panel</h1>
        <p>Gestión de sucursales y sincronización</p>
        <div className="field">
          <label>Correo</label>
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@empresa.com"
          />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input
            type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="••••••••"
          />
        </div>
        {error && <p className="error-msg">⚠️ {error}</p>}
        <button className="btn-primary" onClick={handleLogin} disabled={loading}>
          {loading ? 'Entrando...' : 'Iniciar sesión'}
        </button>
      </div>
    </div>
  )
}
