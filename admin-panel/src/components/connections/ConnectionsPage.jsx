import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const SERVER_URL    = import.meta.env.VITE_SERVER_URL
const DASHBOARD_KEY = import.meta.env.VITE_DASHBOARD_KEY

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000)
  if (s < 60)   return `hace ${s}s`
  if (s < 3600) return `hace ${Math.floor(s/60)}m`
  return `hace ${Math.floor(s/3600)}h`
}

export default function ConnectionsPage() {
  const [branches,    setBranches]    = useState([])
  const [connections, setConnections] = useState({})
  const [sseStatus,   setSseStatus]   = useState('connecting')
  const [lastUpdate,  setLastUpdate]  = useState(null)
  const esRef = useRef(null)

  useEffect(() => {
    supabase.from('branches').select('branch_id,name,pos_system,active').order('name')
      .then(({ data }) => setBranches(data ?? []))
  }, [])

  useEffect(() => {
    connectSSE()
    return () => esRef.current?.close()
  }, [])

  function connectSSE() {
    setSseStatus('connecting')
    const es = new EventSource(`${SERVER_URL}/api/connections`, { headers: { 'x-api-key': DASHBOARD_KEY } })
    esRef.current = es
    es.addEventListener('snapshot', e => {
      const list = JSON.parse(e.data); const map = {}
      for (const b of list) map[b.branchId] = b
      setConnections(map); setLastUpdate(new Date()); setSseStatus('ok')
    })
    es.addEventListener('connected',    e => { const b = JSON.parse(e.data); setConnections(p => ({ ...p, [b.branchId]: { ...p[b.branchId], ...b } })); setLastUpdate(new Date()) })
    es.addEventListener('disconnected', e => { const { branchId } = JSON.parse(e.data); setConnections(p => { const u = { ...p }; delete u[branchId]; return u }); setLastUpdate(new Date()) })
    es.onerror = () => { setSseStatus('error'); es.close(); setTimeout(connectSSE, 5000) }
  }

  async function forceSync(branchId) {
    await fetch(`${SERVER_URL}/api/branches/${branchId}/sync`, { method:'POST', headers:{ 'x-api-key': DASHBOARD_KEY } })
  }

  const connectedIds = new Set(Object.keys(connections))
  const online  = branches.filter(b => connectedIds.has(b.branch_id))
  const offline = branches.filter(b => !connectedIds.has(b.branch_id))

  const sseColors = { connecting:'var(--yellow)', ok:'var(--green)', error:'var(--red)' }
  const sseLabels = { connecting:'Conectando...', ok:'En vivo', error:'Sin conexión — reintentando' }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Conexiones en tiempo real</h1><p className="subtitle">{online.length} conectadas · {offline.length} desconectadas</p></div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {lastUpdate && <span style={{ fontSize:11, color:'var(--text-3)' }}>Actualizado: {lastUpdate.toLocaleTimeString('es-MX')}</span>}
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:sseColors[sseStatus] }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:sseColors[sseStatus], display:'inline-block' }} />
            {sseLabels[sseStatus]}
          </div>
        </div>
      </div>

      {online.length > 0 && (
        <section className="conn-section">
          <h2 className="conn-section-title">🟢 Conectadas</h2>
          <div className="conn-grid">
            {online.map(b => {
              const conn = connections[b.branch_id]
              const [syncing, setSyncing] = useState(false)
              return (
                <div key={b.branch_id} className="conn-card conn-card--online">
                  <div className="conn-card-header">
                    <div><div className="conn-card-name">{b.name}</div><code style={{ fontSize:11, color:'var(--text-3)' }}>{b.branch_id}</code></div>
                    <span className={`badge badge-pos badge-${b.pos_system}`}>{b.pos_system === 'softrestaurante' ? 'SoftRest.' : 'Squirrel'}</span>
                  </div>
                  <div className="conn-meta">
                    <div className="conn-meta-row"><span className="conn-meta-label">Versión</span><span>{conn?.version ?? '—'}</span></div>
                    <div className="conn-meta-row"><span className="conn-meta-label">Conectado</span><span>{conn?.connectedAt ? timeAgo(conn.connectedAt) : '—'}</span></div>
                    <div className="conn-meta-row"><span className="conn-meta-label">Último sync</span><span>{conn?.lastSyncAt ? timeAgo(conn.lastSyncAt) : 'Pendiente'}</span></div>
                    {conn?.liveData?.corteDia && (
                      <div className="conn-meta-row">
                        <span className="conn-meta-label">Ventas hoy</span>
                        <span>{conn.liveData.corteDia.totalFolios ?? 0} folios</span>
                      </div>
                    )}
                  </div>
                  <button className="btn-sync" disabled={syncing} onClick={async () => { setSyncing(true); await forceSync(b.branch_id); setTimeout(() => setSyncing(false), 2000) }}>
                    {syncing ? '⏳ Sincronizando...' : '↻ Forzar sync'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {offline.length > 0 && (
        <section className="conn-section">
          <h2 className="conn-section-title">🔴 Desconectadas</h2>
          <div className="conn-grid">
            {offline.map(b => (
              <div key={b.branch_id} className="conn-card conn-card--offline">
                <div className="conn-card-header">
                  <div><div className="conn-card-name">{b.name}</div><code style={{ fontSize:11, color:'var(--text-3)' }}>{b.branch_id}</code></div>
                  <span className={`badge badge-pos badge-${b.pos_system}`}>{b.pos_system === 'softrestaurante' ? 'SoftRest.' : 'Squirrel'}</span>
                </div>
                <div className="conn-offline-msg">Sin conexión — el cliente no está corriendo o hay un error de red</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {branches.length === 0 && <div className="empty"><span className="empty-icon">🔌</span><p>No hay sucursales registradas</p></div>}
    </div>
  )
}
